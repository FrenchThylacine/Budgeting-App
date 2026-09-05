import React, { useState } from "react";
import { AtSign, KeyRound, LogOut, Trash2, User as UserIcon } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Section } from "../ui/Section";
import { useTranslation } from "../../i18n/useTranslation";
import { resolveStoredText } from "../../domain/storedText";

/**
 * The account itself: which address signs in, and the password that protects it.
 *
 * The change-password endpoint, its API wrapper and its store action all
 * existed already and were reachable from nowhere in the interface — a signed-in
 * user could not change their own password without going through "forgot
 * password" and their own inbox. This is the missing screen, plus the matching
 * change of address.
 *
 * Both changes ask for the current password. Being signed in is not proof of
 * being the owner: an unattended session would otherwise be enough to move the
 * account to an address the owner does not control, which hands over every
 * future password reset with it.
 */
export const AccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const busy = useAuthStore((s) => s.busy);
  const storeError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const changePassword = useAuthStore((s) => s.changePassword);
  const changeEmail = useAuthStore((s) => s.changeEmail);
  const setUsernameAction = useAuthStore((s) => s.setUsername);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccountAction = useAuthStore((s) => s.deleteAccount);

  const [mode, setMode] = useState<"none" | "email" | "password" | "username" | "delete">("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);

  /*
   * The store carries a key, not a sentence — see `AuthScreen.tsx`'s
   * identical resolution. Rendering `storeError` raw printed the literal
   * string "@auth.error.invalidCredentials" on this screen; found live,
   * while testing Phase 5.17's delete-account error path, but the bug
   * predates it and applied to every error this form can show.
   */
  const error = storeError ? resolveStoredText(storeError, t) : null;

  // Letters, digits, - and _, 3-24 characters, starting with a letter — the
  // same rule the server enforces (`USERNAME_PATTERN`). Checked here too so
  // an obviously invalid attempt is caught before a round trip, not instead
  // of the server check.
  const usernamePattern = /^[a-z][a-z0-9_-]{2,23}$/i;
  const usernameInvalid = mode === "username" && username.length > 0 && !usernamePattern.test(username);

  const close = () => {
    setMode("none");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setEmail(user?.email ?? "");
    setUsername(user?.username ?? "");
    setConfirmEmail("");
    clearError();
  };

  // Checked here as well as on the server, so the mismatch is caught before a
  // round trip rather than after one.
  const mismatch = mode === "password" && confirmPassword.length > 0 && newPassword !== confirmPassword;
  // Case-insensitive, matching the server's own comparison against the
  // normalized address — "Alice@" confirming "alice@" is not a typo.
  const confirmEmailReady = confirmEmail.trim().toLowerCase() === (user?.email ?? "").trim().toLowerCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(null);
    if (mode === "password") {
      if (mismatch || newPassword.length === 0) return;
      if (await changePassword(currentPassword, newPassword)) {
        setDone(t("account.passwordChangedSignedOut"));
        close();
      }
      return;
    }
    if (mode === "email") {
      if (await changeEmail(currentPassword, email)) {
        setDone(t("account.emailUpdated"));
        close();
      }
      return;
    }
    if (mode === "username") {
      if (usernameInvalid || username.length === 0) return;
      if (await setUsernameAction(username)) {
        setDone(t("account.usernameUpdated"));
        close();
      }
      return;
    }
    if (mode === "delete") {
      if (!confirmEmailReady) return;
      // No `close()` and no `done` message: a successful call already signs
      // the account out (see the store action), and there is no "Account"
      // section left to show a confirmation in a moment from now.
      await deleteAccountAction(currentPassword, confirmEmail);
    }
  };

  if (!user) return null;

  return (
    <Section title={t("nav.account")}>
      <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
        <div>
          <div className="text-footnote">{t("account.signedInAs")}</div>
          <div className="text-callout" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {user.email}
          </div>
          <div className="text-footnote" style={{ marginTop: 8 }}>{t("account.username")}</div>
          <div className="text-callout" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {user.username ?? t("account.noUsernameSet")}
          </div>
        </div>

        {done && (
          <p className="text-caption" role="status" style={{ color: "var(--success-text)" }}>
            {done}
          </p>
        )}

        {mode === "none" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Phase 5.17.C: every icon here sits beside its own visible
                label, so it is decoration, not information — `aria-hidden`
                is what stops a screen reader announcing an unlabelled
                graphic on top of the text that already says the same
                thing. */}
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("email"); }}>
              <AtSign size={14} aria-hidden="true" /> {t("account.changeEmail")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("username"); }}>
              <UserIcon size={14} aria-hidden="true" /> {t(user.username ? "account.changeUsername" : "account.setUsername")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("password"); }}>
              <KeyRound size={14} aria-hidden="true" /> {t("account.changePassword")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut size={14} aria-hidden="true" /> {t("nav.signOut")}
            </Button>
            {/* Set apart from the actions above it on purpose: everything
                else here changes how the account signs in, and this ends
                it. A shared row would let one misplaced click become the
                one action in this screen that cannot be undone. */}
            <div style={{ width: "100%", borderTop: "1px solid var(--separator)", paddingTop: 12, marginTop: 4 }}>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { setDone(null); setMode("delete"); }}
              >
                <Trash2 size={14} aria-hidden="true" /> {t("account.deleteAccount")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            {mode === "delete" && (
              <p className="text-caption" role="alert" style={{ margin: 0, color: "var(--danger-text)" }}>
                {t("account.deleteAccountWarning")}
              </p>
            )}

            {mode !== "username" && (
              // Not asked for a username: it is a second way to sign in, not
              // a channel anything gets recovered through, so an unattended
              // session choosing one cannot hand the account to anyone —
              // whoever holds it would still need the password.
              <Field
                label={t("account.currentPassword")}
                hint={t("account.askedForEveryChangeHere")}
              >
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
            )}

            {mode === "email" && (
              <Field label={t("account.newEmailAddress")} hint={t("account.yourBudgetIsUnaffectedOnly")}>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            )}

            {mode === "username" && (
              <Field label={t("account.newUsername")} hint={t("account.usernameHint")}>
                <input
                  className="input"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  style={{ borderColor: usernameInvalid ? "var(--danger)" : undefined }}
                />
              </Field>
            )}

            {mode === "delete" && (
              <Field
                label={t("account.confirmEmailToDelete", { email: user.email })}
                hint={t("account.thisCannotBeUndone")}
              >
                <input
                  className="input"
                  type="email"
                  autoComplete="off"
                  required
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  style={{ borderColor: confirmEmail.length > 0 && !confirmEmailReady ? "var(--danger)" : undefined }}
                />
              </Field>
            )}

            {mode === "password" && (
              <>
                <Field label={t("account.newPassword")}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label={t("account.repeatNewPassword")}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    style={{ borderColor: mismatch ? "var(--danger)" : undefined }}
                  />
                </Field>
                {mismatch && (
                  <p className="text-caption" style={{ color: "var(--danger-text)", margin: 0 }}>
                    {t("account.theTwoPasswordsDoNot")}
                  </p>
                )}
                <p className="text-caption" style={{ margin: 0, color: "var(--text-tertiary)" }}>
                  {t("account.changingYourPasswordSignsOut")}
                </p>
              </>
            )}

            {error && (
              <p className="text-caption" role="alert" style={{ color: "var(--danger-text)", margin: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant={mode === "delete" ? "danger" : "primary"}
                size="sm"
                disabled={
                  busy ||
                  mismatch ||
                  (mode === "username" && (usernameInvalid || username.length === 0)) ||
                  (mode === "delete" && !confirmEmailReady)
                }
              >
                {busy
                  ? t("common.saving")
                  : t(
                      mode === "email"
                        ? "account.changeEmail"
                        : mode === "username"
                          ? "account.saveUsername"
                          : mode === "delete"
                            ? "account.deleteAccount"
                            : "account.changePassword",
                    )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
};
