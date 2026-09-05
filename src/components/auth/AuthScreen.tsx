import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { AppMark } from "../ui/AppMark";
import { Tricolour } from "../ui/Tricolour";
import { useTranslation } from "../../i18n/useTranslation";
import { resolveStoredText } from "../../domain/storedText";

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
  const { t } = useTranslation();
  const initialToken = useMemo(resetTokenFromLocation, []);
  const [mode, setMode] = useState<Mode>(initialToken ? "reset" : "signin");
  const [resetToken] = useState<string | null>(initialToken);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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

  /*
   * The store carries keys, not sentences.
   *
   * `messageFor` writes a `storedText` sigil so the message is said in
   * whatever language is chosen at the moment it is read, rather than the one
   * that was chosen when the request failed. Rendering it raw printed
   * "@auth.sessionExpired" on the sign-in card.
   */
  const error = localError ?? (storeError ? resolveStoredText(storeError, t) : null);

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
      await signIn(email, password, rememberMe);
      return;
    }

    if (mode === "signup") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(t("auth.passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
        return;
      }
      if (password !== confirmPassword) {
        setLocalError(t("auth.error.passwordMismatch"));
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
        setLocalError(t("auth.passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
        return;
      }
      if (password !== confirmPassword) {
        setLocalError(t("auth.error.passwordMismatch"));
        return;
      }
      const ok = await resetPassword(resetToken, password);
      if (ok) {
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setNotice(t("auth.passwordUpdatedSignIn"));
      }
    }
  }

  const copy = {
    signin: { title: t("auth.welcomeBack"), sub: t("auth.signInSub"), action: t("auth.signIn") },
    signup: { title: t("auth.createYourAccount"), sub: t("auth.signUpSub"), action: t("auth.createAccount") },
    forgot: { title: t("auth.resetYourPassword"), sub: t("auth.forgotSub"), action: t("auth.sendResetLink") },
    reset: { title: t("auth.chooseANewPassword"), sub: t("auth.resetSub"), action: t("auth.updatePassword") },
  }[mode];

  return (
    <div className="auth-screen">
      <form className="auth-card card" onSubmit={handleSubmit} noValidate>
        <Tricolour />
        <div className="auth-brand">
          <div className="auth-mark" aria-hidden="true">
            <AppMark size={38} />
          </div>
          <div>
            <div className="text-title">{t("notifications.testTitle")}</div>
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
            <span className="text-caption">{t(mode === "signin" ? "auth.emailOrUsername" : "auth.email")}</span>
            <input
              className="input"
              /*
               * Sign-in accepts either an email or a username (§20), and an
               * `email` input rejects anything without an `@` before the
               * value ever reaches the form — a username would refuse to
               * submit. Sign-up and password reset still require a real
               * address, so only sign-in relaxes this.
               */
              type={mode === "signin" ? "text" : "email"}
              autoComplete={mode === "signin" ? "username" : "email"}
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t(mode === "signin" ? "auth.emailOrUsernamePlaceholder" : "auth.youExampleCom")}
            />
          </label>
        )}

        {mode !== "forgot" && (
          <label className="auth-field">
            <span className="text-caption">
              {t(mode === "signin" ? "auth.password" : "auth.newPassword")}
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
                aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode !== "signin" && (
              <span className="text-note">{t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}</span>
            )}
          </label>
        )}

        {(mode === "signup" || mode === "reset") && (
          <label className="auth-field">
            <span className="text-caption">{t("auth.confirmPassword")}</span>
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
            <span className="text-caption">{t("auth.inviteCodeIfThisDeployment")}</span>
            <input
              className="input"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={t("auth.leaveBlankIfYouWerent")}
            />
          </label>
        )}

        {mode === "signin" && (
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span className="text-caption">{t("auth.rememberMe")}</span>
          </label>
        )}

        <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={busy}>
          {busy ? t("common.working") : copy.action}
        </button>

        <div className="auth-links">
          {mode === "signin" && (
            <>
              {/* Stable hooks for the browser verification harness: the labels
                  are translated, so text is not an address. */}
              <button type="button" data-auth="forgot" className="btn btn-ghost btn-sm" onClick={() => switchMode("forgot")}>
                {t("auth.forgotYourPassword")}
              </button>
              <button type="button" data-auth="signup" className="btn btn-ghost btn-sm" onClick={() => switchMode("signup")}>
                {t("auth.createAnAccount")}
              </button>
            </>
          )}
          {mode === "signup" && (
            <button type="button" data-auth="signin" className="btn btn-ghost btn-sm" onClick={() => switchMode("signin")}>
              <ArrowLeft size={14} aria-hidden="true" /> {t("auth.backToSignIn")}
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" data-auth="signin" className="btn btn-ghost btn-sm" onClick={() => switchMode("signin")}>
              <ArrowLeft size={14} aria-hidden="true" /> {t("auth.backToSignIn")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
