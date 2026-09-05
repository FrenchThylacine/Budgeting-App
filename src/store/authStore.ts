import { create } from "zustand";
import {
  AuthError,
  type AuthUser,
  changeEmail as apiChangeEmail,
  changePassword as apiChangePassword,
  deleteAccount as apiDeleteAccount,
  fetchCurrentUser,
  requestPasswordReset as apiRequestPasswordReset,
  resetPassword as apiResetPassword,
  setUsername as apiSetUsername,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
} from "../api/auth";
import { clearAllCachedSnapshots, setCacheOwner } from "../storage/idb";
import { storedText } from "../domain/storedText";

interface AuthStore {
  user: AuthUser | null;
  /**
   * Whether the session has been checked yet.
   *
   * Separate from `user` because "not checked" and "signed out" must not look
   * alike: rendering the sign-in form during the first check would flash it at
   * someone who is already signed in, on every single load.
   */
  checked: boolean;
  busy: boolean;
  error: string | null;

  checkSession: () => Promise<void>;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  signUp: (email: string, password: string, inviteCode?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  changeEmail: (currentPassword: string, email: string) => Promise<boolean>;
  setUsername: (username: string) => Promise<boolean>;
  deleteAccount: (currentPassword: string, confirmEmail: string) => Promise<boolean>;
  /** Called when the API reports the session is gone mid-use. */
  handleSessionExpired: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  checked: false,
  busy: false,
  error: null,

  checkSession: async () => {
    const user = await fetchCurrentUser();
    // The cache is addressed by account. Pointing it before anything reads it
    // is what stops one account's budget being served to another.
    setCacheOwner(user?.id ?? null);
    set({ user, checked: true });
  },

  signIn: async (email, password, rememberMe = false) => {
    set({ busy: true, error: null });
    try {
      const user = await apiSignIn(email, password, rememberMe);
      setCacheOwner(user.id);
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  signUp: async (email, password, inviteCode) => {
    set({ busy: true, error: null });
    try {
      const user = await apiSignUp(email, password, inviteCode);
      setCacheOwner(user.id);
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  signOut: async () => {
    set({ busy: true });
    try {
      await apiSignOut();
    } catch {
      // Even if the call fails, this device must stop holding the data. The
      // server-side session may survive, but nothing here will use it.
    }
    // Every cached budget, not just this account's: the device may be handed
    // to someone else, and an earlier account's data would still be on it.
    await clearAllCachedSnapshots().catch(() => undefined);
    setCacheOwner(null);
    set({ user: null, busy: false, error: null });
  },

  requestPasswordReset: async (email) => {
    set({ busy: true, error: null });
    try {
      const message = await apiRequestPasswordReset(email);
      set({ busy: false });
      return message;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return null;
    }
  },

  resetPassword: async (token, password) => {
    set({ busy: true, error: null });
    try {
      await apiResetPassword(token, password);
      // The reset invalidates every session, including any this device held.
      await clearAllCachedSnapshots().catch(() => undefined);
      setCacheOwner(null);
      set({ user: null, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ busy: true, error: null });
    try {
      await apiChangePassword(currentPassword, newPassword);
      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  changeEmail: async (currentPassword, email) => {
    set({ busy: true, error: null });
    try {
      const user = await apiChangeEmail(currentPassword, email);
      // The session and the cached budget are keyed on the user id, which does
      // not change, so nothing local needs clearing — only the name on it.
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  setUsername: async (username) => {
    set({ busy: true, error: null });
    try {
      const user = await apiSetUsername(username);
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  deleteAccount: async (currentPassword, confirmEmail) => {
    set({ busy: true, error: null });
    try {
      await apiDeleteAccount(currentPassword, confirmEmail);
      // Same cleanup as signOut: every cached budget, not just this one's —
      // the device may be handed to someone else next.
      await clearAllCachedSnapshots().catch(() => undefined);
      setCacheOwner(null);
      set({ user: null, busy: false, error: null });
      return true;
    } catch (error) {
      set({ busy: false, error: messageFor(error) });
      return false;
    }
  },

  handleSessionExpired: () => {
    setCacheOwner(null);
    void clearAllCachedSnapshots().catch(() => undefined);
    set({
      user: null,
      checked: true,
      error: storedText("auth.sessionExpired"),
    });
  },

  clearError: () => set({ error: null }),
}));

/**
 * The codes the API answers with, and the key each one is said in.
 *
 * Matching on `code` rather than on the message text is the whole point: the
 * server's wording is English, it is written for a log as much as for a
 * person, and a client that displays it verbatim shows an English sentence to
 * a reader who chose German. Anything without a known code falls back to the
 * server's own text — which is honest about the fact that it is not
 * translated, and better than a generic "something went wrong" that hides
 * what actually happened. See `AppError` in `server/src/middleware`.
 */
const ERROR_KEYS: Record<string, string> = {
  invalid_credentials: "auth.error.invalidCredentials",
  email_taken: "auth.error.emailTaken",
  rate_limited: "auth.error.rateLimited",
  invalid_token: "auth.error.invalidToken",
  invite_required: "auth.error.inviteRequired",
  invalid_email: "auth.error.invalidEmail",
  missing_credentials: "auth.error.missingCredentials",
  weak_password: "auth.error.weakPassword",
  password_required: "auth.error.passwordRequired",
  invalid_username: "auth.error.invalidUsername",
  username_taken: "auth.error.usernameTaken",
  confirmation_mismatch: "auth.error.confirmationMismatch",
  network: "auth.error.network",
  unauthenticated: "auth.sessionExpired",
};

function messageFor(error: unknown): string {
  if (error instanceof AuthError) {
    const key = error.code ? ERROR_KEYS[error.code] : undefined;
    return key ? storedText(key) : error.message;
  }
  return storedText("auth.genericError");
}
