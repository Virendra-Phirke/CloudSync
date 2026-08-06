'use client';

export interface OAuthUser {
  email: string;
  name: string;
  picture: string;
}

type AuthCallback = (user: OAuthUser | null, accessToken: string | null) => void;

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current Google OAuth access token from cookie.
 * If the access token cookie is missing (expired), attempts a silent refresh
 * via the /api/auth/token endpoint using the httpOnly refresh token.
 */
export async function getAccessToken(): Promise<string | null> {
  const token = getCookie('g_access_token');
  if (token) return token;

  // Try to refresh silently
  try {
    const res = await fetch('/api/auth/token', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      return data.accessToken ?? null;
    }
  } catch {
    // Network error — return null
  }

  return null;
}

/**
 * Returns the current user info from the g_user cookie, or null if not authenticated.
 */
export function getUserInfo(): OAuthUser | null {
  const raw = getCookie('g_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthUser;
  } catch {
    return null;
  }
}

/**
 * Returns true if the user is currently authenticated (has a valid session).
 */
export function isAuthenticated(): boolean {
  return !!getCookie('g_user');
}

/**
 * Initiates the Google OAuth flow by navigating to /api/auth/google.
 * This triggers a full-page redirect to the Google consent screen.
 */
export function initiateOAuth(): void {
  window.location.href = '/api/auth/google';
}

/**
 * Logs out by clearing all OAuth cookies via /api/auth/logout,
 * then reloading the page to reset client state.
 */
export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  // Clear local cookie copies immediately (belt-and-suspenders)
  document.cookie = 'g_access_token=; path=/; max-age=0';
  document.cookie = 'g_user=; path=/; max-age=0';
}

/**
 * Checks the current auth state and calls the callback with the user and token.
 * Returns a cleanup function (no-op — for API compatibility with firebase initAuth).
 */
export function initAuth(
  onSuccess?: (user: OAuthUser, token: string) => void,
  onFailure?: () => void
): () => void {
  const user = getUserInfo();
  const token = getCookie('g_access_token');

  if (user && token) {
    onSuccess?.(user, token);
  } else if (user && !token) {
    // User cookie present but access token expired — try refresh
    fetch('/api/auth/token', { method: 'POST' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.accessToken) {
          onSuccess?.(user, data.accessToken);
        } else {
          onFailure?.();
        }
      })
      .catch(() => onFailure?.());
  } else {
    onFailure?.();
  }

  // Return a no-op unsubscribe function for API compatibility
  return () => {};
}

/**
 * handleRedirectCallback — no-op in this OAuth implementation.
 * The OAuth callback is handled server-side at /api/auth/callback/google.
 * Kept for API compatibility with components that import it from the old firebase.ts.
 */
export async function handleRedirectCallback(
  onSuccess: (user: OAuthUser, token: string) => void,
  onError: (error: Error) => void
): Promise<null> {
  // Check if we just came back from a successful OAuth flow
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success')) {
      const user = getUserInfo();
      const token = getCookie('g_access_token');
      if (user && token) {
        onSuccess(user, token);
        // Clean up query param
        const url = new URL(window.location.href);
        url.searchParams.delete('auth_success');
        window.history.replaceState({}, '', url.toString());
      }
    }
    if (params.get('auth_error')) {
      const err = params.get('auth_error') || 'unknown_error';
      onError(new Error(err));
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.toString());
    }
  }
  return null;
}
