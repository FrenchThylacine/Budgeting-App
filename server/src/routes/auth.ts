import { Router, type Request, type Response } from "express";
import { AuthRepository, isPlausibleEmail, normalizeEmail } from "../auth/AuthRepository.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../auth/cookies.js";
import { sendPasswordResetEmail } from "../auth/email.js";
import { requireAuth } from "../auth/middleware.js";
import { hashPassword, needsRehash, validatePassword, verifyPassword } from "../auth/password.js";
import {
  RESET_TTL_MINUTES,
  SESSION_TTL_DAYS,
  UNREMEMBERED_SESSION_TTL_DAYS,
  createToken,
  hashToken,
} from "../auth/tokens.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/** Attempts allowed in the window before a bucket is refused. */
const SIGNIN_MAX_ATTEMPTS = 10;
const SIGNIN_WINDOW_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;
const RESET_WINDOW_MINUTES = 60;

/**
 * The public origin, used to build links that arrive by email.
 *
 * Never taken from the Host or Referer header. Those are attacker-controlled,
 * and a reset link built from them would deliver a valid one-time token to a
 * domain of the attacker's choosing — the classic host-header poisoning
 * account takeover.
 */
function publicOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL ?? process.env.CORS_ORIGIN;
  const first = configured?.split(",")[0]?.trim();
  if (first && /^https?:\/\//.test(first)) return first.replace(/\/+$/, "");
  return "http://localhost:5173";
}

/** Client-visible shape of an account. Never includes the password hash. */
function publicUser(user: { id: string; email: string }): { id: string; email: string } {
  return { id: user.id, email: user.email };
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export function createAuthRoutes(): Router {
  const router = Router();
  const getRepo = () => new AuthRepository();

  /**
   * POST /api/auth/signup
   *
   * The first account created adopts the budget that already existed, so
   * introducing accounts does not orphan the data the app was already holding.
   */
  router.post(
    "/signup",
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, inviteCode } = req.body ?? {};

      // Optional gate. A personal finance app on a public URL otherwise lets
      // anyone create an account; when the variable is unset, signup is open.
      const requiredInvite = process.env.SIGNUP_INVITE_CODE;
      if (requiredInvite && String(inviteCode ?? "") !== requiredInvite) {
        throw new AppError(403, "This deployment requires an invite code to sign up.", "invite_required");
      }

      if (!isPlausibleEmail(email)) throw new AppError(400, "Enter a valid email address.", "invalid_email");
      const passwordProblem = validatePassword(password);
      if (passwordProblem) throw new AppError(400, passwordProblem, "weak_password");

      const repo = getRepo();
      const snapshotId = await repo.snapshotIdForNewUser();
      const user = await repo.createUser(email, await hashPassword(password), snapshotId, new Date().toISOString());

      // Detected from the unique constraint rather than a prior SELECT, so two
      // simultaneous signups cannot both pass a check-then-insert.
      if (!user) throw new AppError(409, "An account with that email already exists.", "email_taken");

      const token = createToken();
      await repo.createSession(user.id, hashToken(token), SESSION_TTL_DAYS);
      setSessionCookie(req, res, token);
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  /**
   * POST /api/auth/signin
   *
   * Answers identically for an unknown email and a wrong password, so the
   * endpoint cannot be used to discover which addresses hold an account.
   *
   * `rememberMe` is the only thing that changes here: checked, this is
   * `SESSION_TTL_DAYS` behind a persistent cookie, same as every other
   * sign-in-adjacent flow in this file. Left unchecked (or omitted, which a
   * caller that predates Remember Me will do), the cookie carries no expiry
   * at all — gone when the browser closes — backed by a session row that
   * expires server-side in a day regardless, so a browser that resurrects
   * closed-session cookies cannot turn "unchecked" into "indefinite."
   */
  router.post(
    "/signin",
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, rememberMe } = req.body ?? {};
      if (typeof email !== "string" || typeof password !== "string") {
        throw new AppError(400, "Email and password are required.", "missing_credentials");
      }

      const repo = getRepo();
      // Two buckets: one stops a single account being ground through, the other
      // stops one source spraying many accounts. Neither alone covers both.
      const buckets = [`signin:email:${normalizeEmail(email)}`, `signin:ip:${clientIp(req)}`];
      for (const bucket of buckets) {
        const prior = await repo.recordAndCountAttempts(bucket, SIGNIN_WINDOW_MINUTES);
        if (prior >= SIGNIN_MAX_ATTEMPTS) {
          throw new AppError(429, "Too many sign-in attempts. Try again in a few minutes.", "rate_limited");
        }
      }

      const user = await repo.findUserByEmail(email);
      const ok = user ? await verifyPassword(password, user.passwordHash) : false;

      if (!user || !ok) {
        throw new AppError(401, "Incorrect email or password.", "invalid_credentials");
      }

      // Cost parameters are stored inside the hash, so raising them does not
      // invalidate anyone. Upgrade quietly on the next successful sign-in.
      if (needsRehash(user.passwordHash)) {
        await repo.updatePassword(user.id, await hashPassword(password), new Date().toISOString());
      }

      await Promise.all(buckets.map((bucket) => repo.clearAttempts(bucket)));

      const remember = rememberMe === true;
      const token = createToken();
      await repo.createSession(user.id, hashToken(token), remember ? SESSION_TTL_DAYS : UNREMEMBERED_SESSION_TTL_DAYS);
      setSessionCookie(req, res, token, { persistent: remember });
      res.json({ user: publicUser(user) });
    }),
  );

  /**
   * POST /api/auth/signout
   *
   * Deletes the session server-side as well as clearing the cookie. Clearing
   * only the cookie would leave a token that still authenticates anywhere it
   * had been copied.
   */
  router.post(
    "/signout",
    asyncHandler(async (req: Request, res: Response) => {
      const token = readSessionToken(req);
      if (token) await getRepo().deleteSessionByTokenHash(hashToken(token));
      clearSessionCookie(req, res);
      res.json({ success: true });
    }),
  );

  /**
   * GET /api/auth/me
   *
   * 200 with `user: null` when signed out, rather than 401. This is how the app
   * decides which screen to show on load, and a 401 here would be
   * indistinguishable from a session that expired mid-use.
   */
  router.get(
    "/me",
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) {
        res.json({ user: null });
        return;
      }
      res.json({ user: { id: req.auth.userId, email: req.auth.email } });
    }),
  );

  /**
   * POST /api/auth/forgot-password
   *
   * Always answers the same, whether or not the address has an account, and
   * whether or not the provider accepted the message. Any variation — status,
   * body, or a noticeably different response time — turns this into a way to
   * enumerate accounts.
   */
  router.post(
    "/forgot-password",
    asyncHandler(async (req: Request, res: Response) => {
      const { email } = req.body ?? {};
      const generic = {
        success: true,
        message: "If an account exists for that address, a reset link is on its way.",
      };

      if (typeof email !== "string" || !isPlausibleEmail(email)) {
        res.json(generic);
        return;
      }

      const repo = getRepo();
      const prior = await repo.recordAndCountAttempts(
        `reset:${normalizeEmail(email)}`,
        RESET_WINDOW_MINUTES,
      );
      if (prior >= RESET_MAX_ATTEMPTS) {
        // Still the generic answer: a 429 here would confirm the address.
        res.json(generic);
        return;
      }

      const user = await repo.findUserByEmail(email);
      if (user) {
        const token = createToken();
        await repo.createResetToken(user.id, hashToken(token), RESET_TTL_MINUTES);
        const resetUrl = `${publicOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
        const result = await sendPasswordResetEmail(user.email, resetUrl);
        if (!result.delivered) {
          console.warn(`[auth] Password reset email not delivered: ${result.reason}`);
        }
      }

      res.json(generic);
    }),
  );

  /**
   * POST /api/auth/reset-password
   *
   * Consuming the token and setting the password are separate statements, but
   * the token is claimed first with an atomic conditional update — so a token
   * replayed concurrently can only succeed once.
   */
  router.post(
    "/reset-password",
    asyncHandler(async (req: Request, res: Response) => {
      const { token, password } = req.body ?? {};
      if (typeof token !== "string" || token.length === 0) {
        throw new AppError(400, "This reset link is invalid or has expired.", "invalid_token");
      }
      const passwordProblem = validatePassword(password);
      if (passwordProblem) throw new AppError(400, passwordProblem, "weak_password");

      const repo = getRepo();
      const userId = await repo.consumeResetToken(hashToken(token));
      if (!userId) {
        throw new AppError(400, "This reset link is invalid or has expired.", "invalid_token");
      }

      await repo.updatePassword(userId, await hashPassword(password), new Date().toISOString());

      // Every existing session dies with the old password. Whoever prompted the
      // reset must not keep a session they opened beforehand.
      await repo.deleteAllSessionsForUser(userId);
      clearSessionCookie(req, res);

      res.json({ success: true, message: "Password updated. Sign in with your new password." });
    }),
  );

  /**
   * POST /api/auth/change-password
   *
   * Requires the current password even though the caller is already signed in:
   * otherwise an unattended session is enough to take the account over
   * permanently.
   */
  router.post(
    "/change-password",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { currentPassword, newPassword } = req.body ?? {};
      if (typeof currentPassword !== "string") {
        throw new AppError(400, "Your current password is required.", "password_required");
      }
      const passwordProblem = validatePassword(newPassword);
      if (passwordProblem) throw new AppError(400, passwordProblem, "weak_password");

      const repo = getRepo();
      const user = await repo.findUserById(req.auth!.userId);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new AppError(401, "Your current password is incorrect.", "invalid_credentials");
      }

      await repo.updatePassword(user.id, await hashPassword(newPassword), new Date().toISOString());
      await repo.deleteAllSessionsForUser(user.id);

      // The caller keeps working: sign them straight back in rather than
      // bouncing them to the sign-in screen for changing their own password.
      const token = createToken();
      await repo.createSession(user.id, hashToken(token), SESSION_TTL_DAYS);
      setSessionCookie(req, res, token);
      res.json({ success: true });
    }),
  );

  /**
   * POST /api/auth/change-email
   *
   * Behind the current password, for the same reason as change-password: an
   * unattended session must not be enough to move the account to an address
   * the owner does not control, which would hand over password resets too.
   *
   * The budget itself is keyed on the user id, not the address, so nothing
   * about the data moves — only how the owner signs in.
   */
  router.post(
    "/change-email",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { currentPassword, email } = req.body ?? {};
      if (typeof currentPassword !== "string") {
        throw new AppError(400, "Your current password is required.", "password_required");
      }
      if (typeof email !== "string" || !isPlausibleEmail(email)) {
        throw new AppError(400, "Enter a valid email address.", "invalid_email");
      }

      const repo = getRepo();
      const user = await repo.findUserById(req.auth!.userId);
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new AppError(401, "Your current password is incorrect.", "invalid_credentials");
      }

      const existing = await repo.findUserByEmail(email);
      // Comparing ids rather than rejecting any match, so re-saving the same
      // address — or correcting only its capitalisation — is not an error.
      if (existing && existing.id !== user.id) {
        throw new AppError(409, "That email address is already in use.");
      }

      await repo.updateEmail(user.id, email, new Date().toISOString());
      res.json({ user: { id: user.id, email: email.trim() } });
    }),
  );

  return router;
}
