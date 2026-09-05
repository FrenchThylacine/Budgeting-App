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

/**
 * Ask the browser for a tab.
 *
 * **PUT first.** Modern Chrome answers `/json/new` with 405 to a GET, and this
 * used to reach for `waitForJson` — which is a *poller*, written for "wait for
 * the browser to come up" — before falling back. So every tab spent the
 * poller's full fifteen-second timeout being told no, over and over, by a
 * server that was already up and had already given its final answer.
 *
 * Measured: 15,059ms, 15,020ms and 15,043ms to open three tabs. It is the
 * single largest cost in the harness — `verify-airshow.mjs` opens fourteen, so
 * three and a half minutes of a four-minute run were this — and it was
 * invisible because the checks all passed at the end of it.
 *
 * A 405 is an answer, not a "not yet", so there is nothing here to poll. Two
 * methods, one retry apiece for a genuinely dropped connection, and a tab now
 * takes about ten milliseconds.
 */
async function newTarget(endpoint, url) {
  const address = `${endpoint}/json/new?${encodeURIComponent(url)}`;
  let last = "no response";
  for (let attempt = 0; attempt < 2; attempt++) {
    // GET is kept for older Chrome, which is the one that accepts it.
    for (const method of ["PUT", "GET"]) {
      const response = await fetch(address, { method }).catch((error) => {
        last = error.message;
        return null;
      });
      if (response?.ok) return await response.json();
      if (response) last = `${method} ${response.status}`;
    }
    if (attempt === 0) await sleep(150);
  }
  throw new Error(`Could not open a tab at ${address}: ${last}`);
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

    /*
     * A closed socket settles everything still waiting on it.
     *
     * `send` resolves from a message that will now never arrive, so without
     * this a caller that is mid-`evaluate` when the tab goes away waits for
     * ever — and because the harness runs its checks inside a `try`, "for
     * ever" means a run that neither passes nor fails.
     */
    socket.addEventListener("close", () => {
      for (const [, entry] of this.pending) entry.reject(new Error("The page was closed while a command was in flight"));
      this.pending.clear();
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
   * Close this tab.
   *
   * Over HTTP rather than with `Page.close`, because the socket is the thing
   * being closed: a command sent down it races its own answer. `launch` sets
   * `endpoint` and `targetId`; a session without them just drops its socket,
   * which is what a caller wants either way.
   *
   * Scripts that open one tab need never call this — `close()` on the browser
   * takes everything with it. It is here for the ones that open many:
   * `verify-airshow.mjs` loads the page fourteen times to photograph fourteen
   * moments of the same animation, and fourteen live tabs is fourteen renderer
   * processes.
   */
  async close() {
    try {
      this.socket.close();
    } catch {
      /* already gone */
    }
    if (!this.endpoint || !this.targetId) return;
    try {
      await fetch(`${this.endpoint}/json/close/${this.targetId}`);
    } catch {
      /* the browser may already be down; the group kill covers it */
    }
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

  /*
   * Its own process group, which is the whole of the leak fix.
   *
   * Chrome is not one process. A headless run is a browser process, a GPU
   * process, a zygote, a network service and one renderer per tab — eight or
   * nine of them — and `child.kill()` signals **only the one Node spawned**.
   * The rest are reparented to init and carry on holding their share of a
   * gigabyte of profile each. Measured over about twenty harness runs in one
   * session: 180 orphaned processes and 7.0 GB of temp directories, with every
   * run reporting its checks and exiting 0.
   *
   * `detached` makes the child a process-group leader, so its group id is its
   * pid and `process.kill(-pid)` reaches every process in the tree. There is
   * no POSIX way to do that without the group — which is why this is a spawn
   * option rather than something `close()` can fix on its own.
   */
  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

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
    const target = await newTarget(endpoint, url);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const session = new Session(socket);
    session.targetId = target.id;
    session.endpoint = endpoint;
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

  /**
   * Signal the browser's whole process group.
   *
   * `-pid` is the group, and the group is the point: see the spawn above.
   * Windows has no process groups to signal, so it falls back to the single
   * child, which is what the code did everywhere before.
   */
  const signalGroup = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {
      /* already gone, or never started */
    }
  };

  /**
   * Tear everything down, once, whatever happened.
   *
   * Registered on `exit` as well as returned, because the harness's own
   * failures are exactly the runs that used to leak: a check that throws
   * outside the `try`, a `Ctrl-C` during a twenty-second wait, an unhandled
   * rejection in a page callback. All three left a browser running.
   */
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;

    for (const session of sessions) {
      try {
        session.socket.close();
      } catch {
        /* already gone */
      }
    }

    // Ask, then insist. Chrome flushes its profile on SIGTERM, and a profile
    // deleted out from under a browser that is still writing to it is how a
    // directory survives the `rmSync` below.
    const exited = new Promise((resolve) => child.once("exit", resolve));
    signalGroup("SIGTERM");
    const gaveUp = await Promise.race([exited.then(() => false), sleep(3000).then(() => true)]);
    if (gaveUp) {
      signalGroup("SIGKILL");
      await Promise.race([exited, sleep(500)]);
    }

    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* a profile left behind is not worth failing a run over */
    }
  };

  /*
   * The last resort, and it has to be synchronous: `process.on("exit")` runs no
   * asynchronous work, so this is the one place that kills without waiting.
   * `rmSync` is synchronous too, so the profile goes with it.
   */
  const onExit = () => {
    if (closed) return;
    closed = true;
    signalGroup("SIGKILL");
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* nothing left to do at exit */
    }
  };
  process.once("exit", onExit);
  // A signal does not run `exit` handlers on its own; these re-raise so the
  // caller still sees the interrupt as an interrupt.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      onExit();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }

  return { open, close, endpoint };
}
