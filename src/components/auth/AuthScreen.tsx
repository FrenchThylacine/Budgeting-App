import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { FinMark } from "../ui/FinMark";
import { Tricolour } from "../ui/Tricolour";

type Mode = "signin" | "signup" | "forgot" | "reset";

const MIN_PASSWORD_LENGTH = 10;

/**
 * Read a password-reset token from the URL.
 *
 * Supports both `/reset-password?token=…` and `/?token=…`, because whether the
 * link keeps its path depends on how the static host rewrites unknown routes —
 * and a reset link that lands on the wrong screen is a support request, not an
 * edge case.
 */
function resetTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) return null;
  const path = window.location.pathname;
  if (path === "/reset-password" || path === "/" || path === "") return token;
  return token;
}

/** Remove the token from the address bar once it has been read. */
function clearTokenFromLocation(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export const AuthScreen: React.FC = () => {
  const initialToken = useMemo(resetTokenFromLocation, []);
  const [mode, setMode] = useState<Mode>(initialToken ? "reset" : "signin");
  const [resetToken] = useState<string | null>(initialToken);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = useAuthStore((s) => s.busy);
  const storeError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  // A token in the address bar is a live credential: it must not stay in
  // history, or be handed to the next site through a Referer header.
  useEffect(() => {
    if (initialToken) clearTokenFromLocation();
  }, [initialToken]);

  const error = localError ?? storeError;

  function switchMode(next: Mode): void {
    setMode(next);
    setLocalError(null);
    setNotice(null);
    clearError();
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    clearError();

    if (mode === "signin") {
      await signIn(email, password);
      return;
    }

    if (mode === "signup") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("The two passwords do not match.");
        return;
      }
      await signUp(email, password, inviteCode.trim() || undefined);
      return;
    }

    if (mode === "forgot") {
      const message = await requestPasswordReset(email);
      // The same wording whether or not the address has an account: anything
      // else would let this form be used to discover who has one.
      if (message) setNotice(message);
      return;
    }

    if (mode === "reset" && resetToken) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("The two passwords do not match.");
        return;
      }
      const ok = await resetPassword(resetToken, password);
      if (ok) {
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setNotice("Password updated. Sign in with your new password.");
      }
    }
  }

  const copy = {
    signin: { title: "Welcome back", sub: "Sign in to your budget.", action: "Sign in" },
    signup: { title: "Create your account", sub: "Your budget stays private to you.", action: "Create account" },
    forgot: { title: "Reset your password", sub: "We'll email you a link.", action: "Send reset link" },
    reset: { title: "Choose a new password", sub: "This link works once.", action: "Update password" },
  }[mode];

  return (
    <div className="auth-screen">
      <form className="auth-card card" onSubmit={handleSubmit} noValidate>
        <Tricolour />
        <div className="auth-brand">
          <div className="auth-mark" aria-hidden="true">
            <FinMark size={34} />
          </div>
          <div>
            <div className="text-title">Budget OS</div>
            <div className="text-caption">{copy.sub}</div>
          </div>
        </div>

        <h1 className="auth-title">{copy.title}</h1>

        {notice && (
          <p className="auth-banner auth-banner-ok" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{notice}</span>
          </p>
        )}
        {error && (
          <p className="auth-banner auth-banner-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {mode !== "reset" && (
          <label className="auth-field">
            <span className="text-caption">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
        )}

        {mode !== "forgot" && (
          <label className="auth-field">
            <span className="text-caption">
              {mode === "signin" ? "Password" : "New password"}
            </span>
            <div className="auth-password">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                // Tells a password manager whether to offer a saved entry or a
                // generated one; the wrong value makes it silently unhelpful.
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={mode === "signin" ? undefined : MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={mode === "reset"}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode !== "signin" && (
              <span className="text-note">
                At least {MIN_PASSWORD_LENGTH} characters. Length matters more than symbols.
              </span>
            )}
          </label>
        )}

        {(mode === "signup" || mode === "reset") && (
          <label className="auth-field">
            <span className="text-caption">Confirm password</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        )}

        {mode === "signup" && (
          <label className="auth-field">
            <span className="text-caption">Invite code (if this deployment requires one)</span>
            <input
              className="input"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Leave blank if you weren't given one"
            />
          </label>
        )}

        <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={busy}>
          {busy ? "Working…" : copy.action}
        </button>

        <div className="auth-links">
          {mode === "signin" && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("forgot")}>
                Forgot your password?
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("signup")}>
                Create an account
              </button>
            </>
          )}
          {mode === "signup" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("signin")}>
              <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode("signin")}>
              <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
