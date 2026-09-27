'use client';

export interface OAuthUser {
  email: string;
  name: string;
  picture: string;
}

type AuthCallback = (user: OAuthUser | null, accessToken: string | null) => void;

import { isDesktop } from './desktopAdapter';

let desktopUserCache: OAuthUser | null = null;

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current Google OAuth access token.
 * On desktop: Retrieves the short-lived access token via Electron IPC and server-held refresh token.
 * On web: Retrieves the access token from cookies, refreshing via /api/auth/token if expired.
 */
export async function getAccessToken(): Promise<string | null> {
  if (isDesktop() && window.cloudSyncDesktop?.auth) {
    return await window.cloudSyncDesktop.auth.getAccessToken();
  }

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
 * Returns the current user info, or null if not authenticated.
 */
export function getUserInfo(): OAuthUser | null {
  if (isDesktop()) {
    return desktopUserCache;
  }
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
  if (isDesktop()) {
    return Boolean(desktopUserCache);
  }
  return !!getCookie('g_user');
}

/**
 * Initiates the Google OAuth flow.
 * On desktop: Opens isolated auth window, dispatches desktop:providerConnected on success.
 * On web: Navigates to /api/auth/google.
 */
export function initiateOAuth(): void {
  if (isDesktop() && window.cloudSyncDesktop?.auth) {
    window.cloudSyncDesktop.auth.login().then((success) => {
      if (success) {
        // Dispatch the same event AccountsView listens for — reliable UI refresh
        window.dispatchEvent(new CustomEvent('desktop:providerConnected', { detail: { provider: 'google' } }));
      } else {
        // Login cancelled or failed — clear the connecting spinner
        window.dispatchEvent(new CustomEvent('desktop:providerConnectFailed', { detail: { provider: 'google' } }));
      }
    });
    return;
  }
  window.location.href = '/api/auth/google';
}

/**
 * Logs out:
 * On desktop: Clears DPAPI safeStorage session and memory cache; IPC push notifies UI.
 * On web: Clears all OAuth cookies via /api/auth/logout.
 */
export async function logout(): Promise<void> {
  if (isDesktop() && window.cloudSyncDesktop?.auth) {
    await window.cloudSyncDesktop.auth.logout();
    desktopUserCache = null;
    // No reload needed — desktop:authChanged IPC event (user: null) triggers initAuth onFailure
    return;
  }
  await fetch('/api/auth/logout', { method: 'POST' });
  // Clear local cookie copies immediately (belt-and-suspenders)
  document.cookie = 'g_access_token=; path=/; max-age=0';
  document.cookie = 'g_user=; path=/; max-age=0';
}

/**
 * Checks the current auth state and calls the callback with the user and token.
 */
export function initAuth(
  onSuccess?: (user: OAuthUser, token: string) => void,
  onFailure?: () => void
): () => void {
  const desktopAuth = typeof window !== 'undefined' ? window.cloudSyncDesktop?.auth : undefined;
  if (isDesktop() && desktopAuth) {
    let active = true;

    const syncDesktopAuth = async () => {
      try {
        const user = await desktopAuth.getSession();
        if (!active) return;
        desktopUserCache = user;
        if (user) {
          const token = await desktopAuth.getAccessToken();
          if (!active) return;
          if (token) {
            onSuccess?.(user, token);
            return;
          }
        }
        onFailure?.();
      } catch {
        if (active) onFailure?.();
      }
    };

    syncDesktopAuth();

    const unsub = window.cloudSyncDesktop?.onAuthChanged?.((payload) => {
      desktopUserCache = payload.user;
      if (payload.user) {
        desktopAuth.getAccessToken().then((token) => {
          if (token) onSuccess?.(payload.user!, token);
          else onFailure?.();
        });
      } else {
        onFailure?.();
      }
    });

    // Also listen for provider auth changes (Dropbox, OneDrive)
    const unsubProvider = window.cloudSyncDesktop?.onProviderAuthChanged?.((payload) => {
      if (payload.user) {
        markDesktopProviderAuthenticated(payload.provider, true, payload.user as OAuthUser);
      } else {
        markDesktopProviderAuthenticated(payload.provider, false);
      }
    });

    return () => {
      active = false;
      unsub?.();
      unsubProvider?.();
    };
  }

  const user = getUserInfo();
  const token = getCookie('g_access_token');

  if (user && token) {
    onSuccess?.(user, token);
  } else if (user && !token) {
    // User cookie present but access token expired — try refresh
    fetch('/api/auth/token', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
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

  return () => {};
}

/**
 * handleRedirectCallback — checks if we just returned from an OAuth flow (Google, Dropbox, OneDrive).
 * Kept for API compatibility with components that import it.
 */
export async function handleRedirectCallback(
  onSuccess: (user: OAuthUser, token: string) => void,
  onError: (error: Error) => void
): Promise<null> {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('provider') || 'google';

    if (params.get('auth_success')) {
      const user = getProviderUserInfo(provider as any) || getUserInfo();
      const token = await getProviderAccessToken(provider as any) || await getAccessToken();
      if (user && token) {
        onSuccess(user, token);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_success');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    }
    if (params.get('auth_error')) {
      const err = params.get('auth_error') || 'unknown_error';
      onError(new Error(err));
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    }
  }
  return null;
}

// ─── Multi-Cloud Extended API ──────────────────────────────────────────────────

export type CloudProviderType = 'google' | 'dropbox' | 'onedrive';

export async function getProviderAccessToken(provider: CloudProviderType): Promise<string | null> {
  if (provider === 'google') return getAccessToken();

  // Desktop: use the IPC bridge which returns the in-memory cached token
  if (isDesktop() && window.cloudSyncDesktop?.auth?.getProviderAccessToken) {
    return await window.cloudSyncDesktop.auth.getProviderAccessToken(provider);
  }

  const cookieName = provider === 'dropbox' ? 'dbx_access_token' : 'one_access_token';
  const token = getCookie(cookieName);
  if (token) return token;

  // Try silent refresh
  try {
    const res = await fetch(`/api/auth/token?provider=${provider}`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      return data.accessToken ?? null;
    }
  } catch {}

  return null;
}

export function getProviderUserInfo(provider: CloudProviderType): OAuthUser | null {
  if (provider === 'google') return getUserInfo();

  // Desktop: return from in-memory cache populated after IPC OAuth flow
  if (isDesktop()) {
    const cached = _desktopProviderUserCache[provider];
    return cached || null;
  }

  const cookieName = provider === 'dropbox' ? 'dbx_user' : 'one_user';
  const raw = getCookie(cookieName);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthUser;
  } catch {
    return null;
  }
}

// In-memory set tracking authenticated providers on desktop (no cookies available)
const _desktopAuthenticatedProviders = new Set<string>();
const _desktopProviderUserCache: Record<string, OAuthUser> = {};

export function markDesktopProviderAuthenticated(provider: string, authenticated: boolean, user?: OAuthUser) {
  if (authenticated) {
    _desktopAuthenticatedProviders.add(provider);
    if (user) {
      _desktopProviderUserCache[provider] = user;
    }
  } else {
    _desktopAuthenticatedProviders.delete(provider);
    delete _desktopProviderUserCache[provider];
  }
}

export function isProviderAuthenticated(provider: CloudProviderType): boolean {
  if (provider === 'google') return isAuthenticated();
  // Desktop: check the in-memory authenticated set (no browser cookies)
  if (isDesktop()) {
    return _desktopAuthenticatedProviders.has(provider);
  }
  const cookieName = provider === 'dropbox' ? 'dbx_user' : 'one_user';
  return Boolean(getCookie(cookieName));
}

export function initiateProviderOAuth(provider: CloudProviderType): void {
  if (provider === 'google') {
    initiateOAuth();
    return;
  }

  // Desktop: use the Electron IPC auth bridge instead of navigating the main window
  if (isDesktop() && window.cloudSyncDesktop?.auth?.loginWithProvider) {
    window.cloudSyncDesktop.auth.loginWithProvider(provider).then((success) => {
      if (success) {
        markDesktopProviderAuthenticated(provider, true);
        window.dispatchEvent(new CustomEvent('desktop:providerConnected', { detail: { provider } }));
      } else {
        // Login cancelled or failed — clear spinner
        window.dispatchEvent(new CustomEvent('desktop:providerConnectFailed', { detail: { provider } }));
      }
    });
    return;
  }

  // Web: clear stale cookies then redirect to backend OAuth initiation
  const tokenCookie = provider === 'dropbox' ? 'dbx_access_token' : 'one_access_token';
  const userCookie = provider === 'dropbox' ? 'dbx_user' : 'one_user';
  if (typeof document !== 'undefined') {
    document.cookie = `${tokenCookie}=; path=/; max-age=0`;
    document.cookie = `${userCookie}=; path=/; max-age=0`;
  }
  window.location.href = `/api/auth/${provider}`;
}

export async function disconnectProvider(provider: CloudProviderType): Promise<void> {
  if (provider === 'google') {
    await logout();
    return;
  }

  // Desktop: clear the in-memory cache via IPC
  if (isDesktop() && window.cloudSyncDesktop?.auth?.disconnectProvider) {
    await window.cloudSyncDesktop.auth.disconnectProvider(provider);
    markDesktopProviderAuthenticated(provider, false);
    return;
  }

  await fetch(`/api/auth/logout?provider=${provider}`, { method: 'POST' });
  const tokenCookie = provider === 'dropbox' ? 'dbx_access_token' : 'one_access_token';
  const userCookie = provider === 'dropbox' ? 'dbx_user' : 'one_user';
  document.cookie = `${tokenCookie}=; path=/; max-age=0`;
  document.cookie = `${userCookie}=; path=/; max-age=0`;
}

export async function fetchCloudConnections(): Promise<Array<{
  provider: CloudProviderType;
  name: string;
  connected: boolean;
  user?: OAuthUser;
}>> {
  // Desktop: use IPC getProviderStates — single authoritative source from main process
  if (isDesktop() && window.cloudSyncDesktop?.auth?.getProviderStates) {
    try {
      const states = await window.cloudSyncDesktop.auth.getProviderStates();
      // Sync client-side caches with the returned state
      for (const [p, s] of Object.entries(states)) {
        if (p !== 'google') {
          markDesktopProviderAuthenticated(p, s.connected, s.user as OAuthUser);
        } else if (s.user) {
          desktopUserCache = s.user as OAuthUser;
        } else {
          desktopUserCache = null;
        }
      }
      return [
        { provider: 'google', name: 'Google Drive', connected: states.google?.connected ?? false, user: states.google?.user || undefined },
        { provider: 'dropbox', name: 'Dropbox', connected: states.dropbox?.connected ?? false, user: states.dropbox?.user || undefined },
        { provider: 'onedrive', name: 'Microsoft OneDrive', connected: states.onedrive?.connected ?? false, user: states.onedrive?.user || undefined },
      ];
    } catch (err) {
      console.error('fetchCloudConnections: getProviderStates failed', err);
    }
  }

  // Web: fetch from backend API
  if (!isDesktop()) {
    try {
      const res = await fetch('/api/auth/connections');
      if (res.ok) {
        const data = await res.json();
        return data.connections || [];
      }
    } catch {}
  }

  // Fallback: read from client-side caches
  return [
    { provider: 'google', name: 'Google Drive', connected: isAuthenticated(), user: getUserInfo() || undefined },
    { provider: 'dropbox', name: 'Dropbox', connected: isProviderAuthenticated('dropbox'), user: getProviderUserInfo('dropbox') || undefined },
    { provider: 'onedrive', name: 'Microsoft OneDrive', connected: isProviderAuthenticated('onedrive'), user: getProviderUserInfo('onedrive') || undefined },
  ];
}
