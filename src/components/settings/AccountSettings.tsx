import React, { useState } from "react";
import { AtSign, KeyRound, LogOut } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Section } from "../ui/Section";

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
    <Section title="Account">
      <div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
        <div>
          <div className="text-footnote">Signed in as</div>
          <div className="text-callout" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {user.email}
          </div>
        </div>

        {done && (
          <p className="text-caption" role="status" style={{ color: "var(--success)" }}>
            {done}
          </p>
        )}

        {mode === "none" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("email"); }}>
              <AtSign size={14} /> Change email
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setDone(null); setMode("password"); }}>
              <KeyRound size={14} /> Change password
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut size={14} /> Sign out
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <Field
              label="Current password"
              hint="Asked for every change here, because being signed in is not proof of being the owner."
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
              <Field label="New email address" hint="Your budget is unaffected — only how you sign in changes.">
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
                <Field label="New password">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label="Repeat new password">
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
                  <p className="text-caption" style={{ color: "var(--danger)", margin: 0 }}>
                    The two passwords do not match.
                  </p>
                )}
                <p className="text-caption" style={{ margin: 0, color: "var(--text-tertiary)" }}>
                  Changing your password signs out every other device. This one stays signed in.
                </p>
              </>
            )}

            {error && (
              <p className="text-caption" role="alert" style={{ color: "var(--danger)", margin: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={busy || mismatch}>
                {busy ? "Saving…" : mode === "email" ? "Change email" : "Change password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
};
