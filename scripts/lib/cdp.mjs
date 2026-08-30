/**
 * A very small Chrome DevTools Protocol driver.
 *
 * Why this exists at all: every interesting defect this project has found was
 * found in a browser, and every one of them passed its unit tests first. The
 * checks had always been driven by hand, which meant they were only ever run
 * when somebody remembered — and a stale Chrome process was once enough to
 * block a whole session's verification.
 *
 * Why it is not a library: the whole of it is below, in about two hundred
 * lines, because Node 22 ships a WebSocket client and Chrome ships a protocol.
 * A browser-automation dependency would be a hundred megabytes and a supply
 * chain to keep an eye on, for `Runtime.evaluate` and `Page.captureScreenshot`.
 *
 * Usage:
 *   const chrome = await launch({ headless: true });
 *   const page = await chrome.open("http://localhost:5173");
 *   await page.evaluate("document.title");
 *   await chrome.close();
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll an HTTP endpoint until it answers, or give up. */
async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ?? "no response"}`);
}

class Session {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.consoleMessages = [];
    this.pageErrors = [];

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id != null) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${message.error.message} (${JSON.stringify(entry.params)})`));
        else entry.resolve(message.result);
        return;
      }
      const handlers = this.listeners.get(message.method);
      if (handlers) for (const handler of handlers) handler(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, params });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  /**
   * Evaluate an expression in the page and return its value.
   *
   * `awaitPromise` so `await` at the top level of the expression works, and a
   * thrown exception becomes a rejected promise here rather than a silently
   * undefined result — a check that fails by returning `undefined` is a check
   * that passes by accident.
   */
  async evaluate(expression) {
    /*
     * An expression or a body, decided by looking at it.
     *
     * `document.title` has to be wrapped in a `return`, and
     * `const x = …; return x` must not be. The test is whether the text is a
     * *statement*: a `return`, a semicolon, or a leading declaration keyword.
     * A body that forgets to return simply answers `undefined`, which every
     * caller here treats as a failure rather than as a pass.
     */
    const source = expression.trim();
    const isBody =
      /\breturn\b/.test(source) ||
      /^(const|let|var|if|for|while|try|switch|throw)\b/.test(source) ||
      /;/.test(source.replace(/;\s*$/, ""));
    const result = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${isBody ? source : `return (${source});`} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Page threw: ${text}`);
    }
    return result.result.value;
  }

  /** Wait until an expression is truthy, or fail with what it last was. */
  async waitFor(expression, { timeoutMs = 10000, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (error) {
        last = String(error.message);
      }
      await sleep(90);
    }
    throw new Error(`Timed out waiting for: ${label} (last value: ${JSON.stringify(last)})`);
  }

  async goto(url, { waitForLoad = true } = {}) {
    await this.send("Page.navigate", { url });
    if (!waitForLoad) return;
    await this.waitFor("document.readyState === 'complete'", { label: `${url} to load` });
  }

  /**
   * Click an element by CSS selector.
   *
   * Dispatched as a real mouse event at the element's own centre rather than
   * as `element.click()`: a control that is covered by something else responds
   * to the second and not to the first, and "can this actually be clicked" is
   * exactly the question this harness exists to answer. See the period-selector
   * checks, where an overlay stealing a press was a real defect.
   */
  async click(selector, { real = true } = {}) {
    const box = await this.evaluate(`
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    `);
    if (!box) throw new Error(`No element matched ${selector}`);
    if (box.width === 0 || box.height === 0) throw new Error(`${selector} has no size, so it cannot be clicked`);

    if (!real) {
      await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); return true;`);
      return;
    }
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", {
        type,
        x: Math.round(box.x),
        y: Math.round(box.y),
        button: "left",
        clickCount: 1,
      });
    }
  }

  /** What is actually on top at a point — the hit test, not the intention. */
  async elementAtCentreOf(selector) {
    return this.evaluate(`
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!hit) return null;
      return { tag: hit.tagName, className: hit.className, contains: element.contains(hit) || element === hit };
    `);
  }

  async type(selector, text) {
    await this.evaluate(`
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('No element matched ${selector}');
      element.focus();
      return true;
    `);
    for (const char of text) {
      await this.send("Input.dispatchKeyEvent", { type: "keyDown", text: char });
      await this.send("Input.dispatchKeyEvent", { type: "keyUp", text: char });
    }
  }

  /**
   * Set a React-controlled input's value.
   *
   * `element.value = x` is invisible to React: it stores the value on the DOM
   * node and React's own value tracker then decides nothing changed and
   * swallows the event. Going through the prototype's setter is what makes the
   * change real, and it is the reason typing character by character is used for
   * anything where the *typing* is what is being tested.
   */
  async setValue(selector, value) {
    await this.evaluate(`
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('No element matched: ' + ${JSON.stringify(selector)});
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(element, ${JSON.stringify(String(value))});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
  }

  async screenshot(path, { fullPage = false } = {}) {
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    });
    writeFileSync(path, Buffer.from(result.data, "base64"));
    return path;
  }

  async resize(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  }
}

export async function launch({ headless = true, width = 1440, height = 900 } = {}) {
  const binary = process.env.CHROME_BINARY ?? CHROME_PATHS.find((path) => existsSync(path));
  if (!binary) throw new Error(`No Chrome found. Looked in:\n  ${CHROME_PATHS.join("\n  ")}`);

  const profile = mkdtempSync(join(tmpdir(), "budget-os-cdp-"));
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    `--window-size=${width},${height}`,
  ];
  if (headless) args.push("--headless=new", "--hide-scrollbars");

  const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });

  // The port is printed on stderr because it was asked for as 0 — a fixed port
  // is what makes a second run collide with a browser somebody forgot to close.
  const port = await new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
      if (match) resolve(Number(match[1]));
    };
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`Chrome exited with ${code} before reporting a port:\n${buffer}`)));
    setTimeout(() => reject(new Error(`Chrome did not report a debugging port:\n${buffer}`)), 20000);
  });

  const endpoint = `http://127.0.0.1:${port}`;
  await waitForJson(`${endpoint}/json/version`);

  const sessions = [];

  const open = async (url) => {
    const target = await waitForJson(`${endpoint}/json/new?${encodeURIComponent(url)}`).catch(async () => {
      // Newer Chrome requires PUT for /json/new.
      const response = await fetch(`${endpoint}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      return response.json();
    });
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const session = new Session(socket);
    session.targetId = target.id;
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Log.enable");
    session.on("Runtime.consoleAPICalled", (params) => {
      session.consoleMessages.push({
        level: params.type,
        text: params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "),
      });
    });
    session.on("Runtime.exceptionThrown", (params) => {
      session.pageErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    session.on("Log.entryAdded", (params) => {
      if (params.entry.level === "error") session.pageErrors.push(params.entry.text);
    });
    if (width !== 1440 || height !== 900) await session.resize(width, height);
    await session.waitFor("document.readyState === 'complete'", { label: `${url} to load` });
    sessions.push(session);
    return session;
  };

  const close = async () => {
    for (const session of sessions) {
      try {
        session.socket.close();
      } catch {
        /* already gone */
      }
    }
    child.kill();
    await sleep(200);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* a profile left behind is not worth failing a run over */
    }
  };

  return { open, close, endpoint };
}
