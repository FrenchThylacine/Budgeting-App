/**
 * Authentication endpoints.
 *
 * Separate from BudgetApiClient because these are the only calls that must work
 * when nobody is signed in — the budget client throws AuthRequiredError on 401,
 * which is exactly the wrong behaviour for a sign-in form.
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
}

/**
 * A rejection the user can act on: wrong password, email taken, rate limited.
 *
 * `code` is the server's stable machine-readable reason. The message is for
 * display and may be reworded at any time, so nothing branches on it.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function baseUrl(): string {
  try {
    const fromEnv = import.meta.env?.VITE_API_URL as string | undefined;
    if (fromEnv) return fromEnv;
  } catch {
    /* import.meta.env unavailable (tests) */
  }
  return "/api";
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Without this the browser neither sends nor stores the session cookie,
      // so signing in appears to succeed and every later request is anonymous.
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthError("Cannot reach the server. Check your connection.", "network", 0);
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    throw new AuthError(
      body?.error ?? "Something went wrong. Try again.",
      body?.code ?? null,
      response.status,
    );
  }
  return body as T;
}

export async function signUp(
  email: string,
  password: string,
  inviteCode?: string,
): Promise<AuthUser> {
  const body = await post<{ user: AuthUser }>("/signup", { email, password, inviteCode });
  return body.user;
}

/** `email` accepts either an email address or a username — the server tells them apart. */
export async function signIn(email: string, password: string, rememberMe = false): Promise<AuthUser> {
  const body = await post<{ user: AuthUser }>("/signin", { email, password, rememberMe });
  return body.user;
}

export async function signOut(): Promise<void> {
  await post<{ success: boolean }>("/signout", {});
}

export async function requestPasswordReset(email: string): Promise<string> {
  const body = await post<{ message: string }>("/forgot-password", { email });
  return body.message;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await post<{ success: boolean }>("/reset-password", { token, password });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await post<{ success: boolean }>("/change-password", { currentPassword, newPassword });
}

export async function changeEmail(currentPassword: string, email: string): Promise<AuthUser> {
  const body = await post<{ user: AuthUser }>("/change-email", { currentPassword, email });
  return body.user;
}

export async function setUsername(username: string): Promise<AuthUser> {
  const body = await post<{ user: AuthUser }>("/set-username", { username });
  return body.user;
}

/**
 * Who is signed in, if anyone.
 *
 * Answers `null` rather than throwing when signed out, because this runs on
 * every load to decide which screen to show. A network failure also yields
 * null — the app then shows the sign-in screen, which is the safe default: it
 * never renders one account's budget to someone who might be another.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${baseUrl()}/auth/me`, { credentials: "include" });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.user ?? null;
  } catch {
    return null;
  }
}
