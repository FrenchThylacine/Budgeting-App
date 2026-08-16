import { create } from "zustand";
import {
  AuthError,
  type AuthUser,
  changePassword as apiChangePassword,
  fetchCurrentUser,
  requestPasswordReset as apiRequestPasswordReset,
  resetPassword as apiResetPassword,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
} from "../api/auth";
import { clearAllCachedSnapshots, setCacheOwner } from "../storage/idb";

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
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, inviteCode?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
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

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const user = await apiSignIn(email, password);
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

  handleSessionExpired: () => {
    setCacheOwner(null);
    void clearAllCachedSnapshots().catch(() => undefined);
    set({
      user: null,
      checked: true,
      error: "Your session expired. Sign in again to continue.",
    });
  },

  clearError: () => set({ error: null }),
}));

function messageFor(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  return "Something went wrong. Try again.";
}
