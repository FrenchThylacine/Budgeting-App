import React, { useState } from "react";
import { AtSign, KeyRound, LogOut } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Section } from "../ui/Section";
import { useTranslation } from "../../i18n/useTranslation";

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
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const changePassword = useAuthStore((s) => s.changePassword);
  const changeEmail = useAuthStore((s) => s.changeEmail);
  const signOut = useAuthStore((s) => s.signOut);

  const [mode, setMode] = useState<"none" | "email" | "password">("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setMode("none");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setEmail(user?.email ?? "");
    clearError();
  };

  // Checked here as well as on the server, so the mismatch is caught before a
  // round trip rather than after one.
  const mismatch = mode === "password" && confirmPassword.length > 0 && newPassword !== confirmPassword;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(null);
    if (mode === "password") {
      if (mismatch || newPassword.length === 0) return;
      if (await changePassword(currentPassword, newPassword)) {
        setDone("Password changed. Other devices have been signed out.");
        close();
      }
      return;
    }
    if (mode === "email") {
      if (await changeEmail(currentPassword, email)) {
        setDone("Email address updated.");
        close();
      }
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
        </div>

        {done && (
          <p className="text-caption" role="status" style={{ color: "var(--success-text)" }}>
            {done}
          </p>
        )}

        {mode === "none" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("email"); }}>
              <AtSign size={14} /> {t("account.changeEmail")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("password"); }}>
              <KeyRound size={14} /> {t("account.changePassword")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut size={14} /> {t("nav.signOut")}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
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

            {mode === "email" ? (
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
            ) : (
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
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={busy || mismatch}>
                {busy ? t("common.saving") : t(mode === "email" ? "account.changeEmail" : "account.changePassword")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
};
