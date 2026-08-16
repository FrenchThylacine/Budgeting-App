import type { Request, Response } from "express";
import { DAY_MS, SESSION_TTL_DAYS } from "./tokens.js";

/**
 * The session cookie.
 *
 * Written by hand rather than with cookie-parser so the deployment carries no
 * extra dependency: @vercel/node traces the module graph and transpiles it in
 * place, so every package added is another thing that can fail to resolve at
 * runtime. Reading one cookie and writing one cookie is a small, testable
 * amount of code.
 */

export const SESSION_COOKIE = "budget_session";

/** Parse a Cookie header. Unknown or malformed pairs are skipped, never thrown on. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      // A percent sequence the browser did not write. Keep the raw value rather
      // than discarding the whole header.
      out[name] = raw;
    }
  }
  return out;
}

export function readSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[SESSION_COOKIE];
  return value && value.length > 0 ? value : null;
}

/**
 * Whether the connection is HTTPS.
 *
 * `Secure` cannot be set unconditionally: the browser then refuses the cookie
 * over plain HTTP and local development can never sign in. It also cannot be
 * omitted in production, or the session travels in clear text. `req.protocol`
 * reflects `x-forwarded-proto` only when Express is told to trust the proxy,
 * which is why the header is read directly — Vercel always sets it.
 */
function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof proto === "string" && proto.length > 0) {
    return proto.split(",")[0].trim() === "https";
  }
  return req.protocol === "https";
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript, so an XSS cannot exfiltrate it
    secure: isSecureRequest(req),
    // Lax, not Strict: Strict would drop the cookie when arriving from a
    // password-reset link in an email client, so the user would land signed out
    // on the page that just signed them in. Lax still blocks cross-site POSTs,
    // which is the CSRF case that matters.
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * DAY_MS,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  // The attributes must match the ones used to set it, or the browser keeps the
  // original cookie and "sign out" silently does nothing.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
  });
}
