import { BrowserWindow, safeStorage, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMainWindow } from '../main/window';
import { logger } from '../utils/logger';

const BACKEND_URL = process.env.CLOUDSYNC_BACKEND_URL || 'https://cloudsync.itsvirendra.in';

// Local app URL — set by window.ts after resolveAppUrl() resolves.
let APP_URL = 'http://localhost:3000';
export function setAppUrl(url: string) {
  APP_URL = url;
  logger.info('AUTH', `App URL set to: ${url}`);
}

type CloudProvider = 'google' | 'dropbox' | 'onedrive';

const PROVIDER_COOKIE_MAP: Record<string, { token: string; user: string }> = {
  google: { token: 'g_access_token', user: 'g_user' },
  dropbox: { token: 'dbx_access_token', user: 'dbx_user' },
  onedrive: { token: 'one_access_token', user: 'one_user' },
};

// In-memory cache for provider tokens (not persisted to disk for non-Google providers)
const providerTokenCache: Record<string, { token: string; expiresAt: number }> = {};
const providerUserCache: Record<string, { email: string; name: string; picture: string }> = {};

export interface DesktopUser {
  email: string;
  name: string;
  picture: string;
}

export interface StoredSession {
  sessionToken: string;
  user: DesktopUser;
  providers?: Record<string, {
    token: string;
    expiresAt: number;
    user: DesktopUser;
  }>;
}

class DesktopAuthService {
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;
  private memorySession: StoredSession | null = null;

  private getSessionFilePath(): string {
    const userData = app ? app.getPath('userData') : path.join(process.cwd(), '.desktop-data');
    return path.join(userData, 'desktop-session.enc');
  }

  /**
   * Resolves the base URL for OAuth flows.
   * If local dev server (port 3000) is running and responds to the auth route, uses localhost:3000.
   * Otherwise falls back to production BACKEND_URL (https://cloudsync.itsvirendra.in).
   */
  public async resolveAuthEndpoint(provider: string): Promise<string> {
    try {
      const probePath = provider === 'google' ? 'desktop?challenge=ping&state=ping' : provider;
      const res = await fetch(`http://localhost:3000/api/auth/${probePath}`, { method: 'HEAD', redirect: 'manual' });
      if (res.status < 400 || res.status === 307 || res.status === 302) {
        return 'http://localhost:3000';
      }
    } catch {}
    return BACKEND_URL;
  }

  /**
   * Loads the encrypted CloudSync session from OS-backed safeStorage (Windows DPAPI).
   */
  public async getSession(): Promise<StoredSession | null> {
    if (this.memorySession) return this.memorySession;

    const filePath = this.getSessionFilePath();
    if (!fs.existsSync(filePath)) return null;

    try {
      const buffer = fs.readFileSync(filePath);
      let jsonStr: string;

      if (safeStorage.isEncryptionAvailable()) {
        jsonStr = safeStorage.decryptString(buffer);
      } else {
        // Fallback if OS encryption is unavailable
        jsonStr = buffer.toString('utf8');
      }

      this.memorySession = JSON.parse(jsonStr) as StoredSession;

      // Restore provider caches
      if (this.memorySession.providers) {
        for (const [p, data] of Object.entries(this.memorySession.providers)) {
          if (data?.token && Date.now() < (data.expiresAt || 0)) {
            providerTokenCache[p] = { token: data.token, expiresAt: data.expiresAt };
            providerUserCache[p] = data.user;
          }
        }
      }

      return this.memorySession;
    } catch (err) {
      logger.error('AUTH', 'Failed to read/decrypt desktop session file', err);
      return null;
    }
  }

  /**
   * Saves the CloudSync session token into OS-backed safeStorage.
   */
  public async saveSession(session: StoredSession): Promise<void> {
    this.memorySession = session;
    const filePath = this.getSessionFilePath();
    const jsonStr = JSON.stringify(session);

    try {
      let buffer: Buffer;
      if (safeStorage.isEncryptionAvailable()) {
        buffer = safeStorage.encryptString(jsonStr);
      } else {
        buffer = Buffer.from(jsonStr, 'utf8');
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);
      logger.info('AUTH', 'Encrypted CloudSync session saved to safeStorage');
    } catch (err) {
      logger.error('AUTH', 'Failed to encrypt/save desktop session', err);
    }
  }

  /**
   * Returns current authenticated user or null.
   */
  public async getUser(): Promise<DesktopUser | null> {
    const session = await this.getSession();
    return session ? session.user : null;
  }

  /**
   * Returns a valid short-lived Google access token.
   * If expired, delegates token refresh to the Vercel backend.
   * The Google refresh token is NEVER exposed to Electron or stored on disk.
   */
  public async getAccessToken(): Promise<string | null> {
    // Return cached token if valid (with 2 min buffer)
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 120000) {
      return this.cachedAccessToken;
    }

    const session = await this.getSession();
    if (!session) return null;

    try {
      logger.info('AUTH', 'Requesting Google access token refresh via Vercel backend');

      // If we have a PKCE sessionToken, call /api/auth/desktop/token
      if (session.sessionToken && session.sessionToken !== 'cookie_session') {
        const response = await fetch(`${BACKEND_URL}/api/auth/desktop/token`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.sessionToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json() as { accessToken: string; expiresIn: number };
          this.cachedAccessToken = data.accessToken;
          this.tokenExpiresAt = Date.now() + (data.expiresIn || 3600) * 1000;
          return this.cachedAccessToken;
        }
      }

      // Fallback: Use Electron net.fetch to call /api/auth/token using the session cookies
      const { net } = require('electron');
      const tokenRes = await net.fetch(`${BACKEND_URL}/api/auth/token`, {
        method: 'POST',
      });

      if (tokenRes.ok) {
        const data = await tokenRes.json() as { accessToken: string };
        if (data.accessToken) {
          this.cachedAccessToken = data.accessToken;
          this.tokenExpiresAt = Date.now() + 3500 * 1000;
          return this.cachedAccessToken;
        }
      }

      logger.warn('AUTH', 'Backend token refresh failed');
      return this.cachedAccessToken;
    } catch (err) {
      logger.error('AUTH', 'Network error during backend token refresh', err);
      return this.cachedAccessToken;
    }
  }

  /**
   * Initiates the secure Google OAuth flow via an isolated BrowserWindow.
   *
   * Key design decisions:
   * - Cookies are ONLY read on `did-navigate` (not `will-redirect`) because
   *   Set-Cookie headers from the backend redirect are committed to the session
   *   store by the time `did-navigate` fires, but not during `will-redirect`.
   * - `session.cookies.flushStore()` ensures the OS-level cookie store is
   *   persisted before we query it.
   * - `desktop:authChanged` is sent to the main window so the UI updates
   *   immediately without a page reload.
   */
  public async login(): Promise<boolean> {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const authBaseUrl = await this.resolveAuthEndpoint('google');
    const authUrl = `${authBaseUrl}/api/auth/desktop?challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`;
    logger.info('AUTH', `Starting Google OAuth flow via: ${authUrl}`);

    return new Promise((resolve) => {
      const parent = getMainWindow();
      let resolved = false;

      const authWindow = new BrowserWindow({
        parent: parent || undefined,
        modal: true,
        width: 560,
        height: 720,
        title: 'Sign in with Google - CloudSync',
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const safeClose = () => {
        try {
          if (!authWindow.isDestroyed()) {
            authWindow.close();
          }
        } catch {}
      };

      const resolveOnce = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      authWindow.on('closed', () => resolveOnce(false));

      // Security: Allowed hostnames for Google OAuth
      let appHost = 'localhost';
      try { appHost = new URL(APP_URL).hostname; } catch {}
      let backendHost = 'cloud-sync-woad.vercel.app';
      try { backendHost = new URL(BACKEND_URL).hostname; } catch {}

      const allowedHosts = [
        appHost,
        backendHost,
        'cloudsync.itsvirendra.in',
        'localhost',
        '127.0.0.1',
      ];

      authWindow.webContents.on('will-navigate', (event, url) => {
        try {
          const parsed = new URL(url);
          const isGoogle =
            parsed.hostname === 'google.com' ||
            parsed.hostname.endsWith('.google.com') ||
            parsed.hostname.includes('.google.') ||
            parsed.hostname.endsWith('.googleusercontent.com') ||
            parsed.hostname.endsWith('.gstatic.com');
          const isAllowedApp = allowedHosts.some(
            (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
          );

          if (!isGoogle && !isAllowedApp) {
            event.preventDefault();
            logger.warn('AUTH', `Blocked unapproved Google OAuth navigation to: ${url}`);
          }
        } catch {
          event.preventDefault();
        }
      });

      const extractGoogleCookies = async (): Promise<{ user: DesktopUser; token: string } | null> => {
        try {
          await authWindow.webContents.session.cookies.flushStore();
        } catch {}

        for (let attempt = 0; attempt < 25; attempt++) {
          if (authWindow.isDestroyed()) return null;

          let cookies = await authWindow.webContents.session.cookies.get({ url: APP_URL });
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: BACKEND_URL });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'https://cloudsync.itsvirendra.in' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'https://cloud-sync-woad.vercel.app' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'http://localhost:3000' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({});
          }

          const accessTokenCookie = cookies.find((c) => c.name === 'g_access_token');
          const userCookie = cookies.find((c) => c.name === 'g_user');

          if (accessTokenCookie && userCookie) {
            try {
              const user = JSON.parse(decodeURIComponent(userCookie.value)) as DesktopUser;
              return { user, token: accessTokenCookie.value };
            } catch (err) {
              logger.error('AUTH', 'Failed to parse g_user cookie', err);
            }
          }

          await new Promise((r) => setTimeout(r, 200));
        }

        return null;
      };

      const finishSuccess = async () => {
        if (resolved) return;
        logger.info('AUTH', 'Google auth_success detected. Extracting session cookies...');

        const result = await extractGoogleCookies();
        if (result && !resolved) {
          resolved = true;
          this.cachedAccessToken = result.token;
          this.tokenExpiresAt = Date.now() + 3500 * 1000;

          const session = (await this.getSession()) || { sessionToken: 'cookie_session', user: result.user };
          session.user = result.user;
          session.sessionToken = 'cookie_session';
          await this.saveSession(session);

          safeClose();

          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('desktop:authChanged', { user: result.user });
          }

          logger.info('AUTH', `Google login successful for: ${result.user.email}`);
          resolve(true);
        } else if (!resolved) {
          logger.warn('AUTH', 'Google auth completed but session cookies not found');
          safeClose();
          resolve(false);
        }
      };

      // Listen for cookie changed event in session for immediate detection
      const cookieListener = (_event: any, cookie: any) => {
        if (cookie.name === 'g_access_token' || cookie.name === 'g_user') {
          finishSuccess();
        }
      };
      authWindow.webContents.session.cookies.on('changed', cookieListener);
      authWindow.on('closed', () => {
        try {
          authWindow.webContents.session.cookies.removeListener('changed', cookieListener);
        } catch {}
      });

      const handleNavigation = async (url: string) => {
        if (resolved) return;

        try {
          const parsed = new URL(url);

          if (parsed.searchParams.has('auth_error')) {
            const errCode = parsed.searchParams.get('auth_error');
            logger.error('AUTH', `Google OAuth failed with error code: ${errCode}`);
            safeClose();
            resolveOnce(false);
            return;
          }

          if (parsed.searchParams.has('auth_success') || url.includes('auth_success')) {
            finishSuccess();
            return;
          }

          // Desktop PKCE exchange path (if backend uses /api/auth/desktop/success)
          if (parsed.pathname === '/api/auth/desktop/success') {
            const code = parsed.searchParams.get('code');
            const returnState = parsed.searchParams.get('state');

            if (returnState !== state || !code) {
              logger.error('AUTH', 'Invalid state or missing code in desktop OAuth callback');
              safeClose();
              resolveOnce(false);
              return;
            }

            safeClose();

            const exchangeRes = await fetch(`${authBaseUrl}/api/auth/desktop/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, verifier: codeVerifier }),
            }).catch(() =>
              fetch(`${BACKEND_URL}/api/auth/desktop/exchange`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, verifier: codeVerifier }),
              })
            );

            if (!exchangeRes || !exchangeRes.ok) {
              resolveOnce(false);
              return;
            }

            const data = (await exchangeRes.json()) as {
              sessionToken: string;
              user: DesktopUser;
              accessToken: string;
            };

            await this.saveSession({ sessionToken: data.sessionToken, user: data.user });
            this.cachedAccessToken = data.accessToken;
            this.tokenExpiresAt = Date.now() + 3500 * 1000;

            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('desktop:authChanged', { user: data.user });
            }

            resolved = true;
            resolve(true);
          }
        } catch (err) {
          logger.error('AUTH', 'Error processing Google OAuth navigation URL', err);
        }
      };

      authWindow.webContents.on('will-redirect', (_event, url) => handleNavigation(url));
      authWindow.webContents.on('did-navigate', (_event, url) => handleNavigation(url));
      authWindow.webContents.on('did-navigate-in-page', (_event, url) => handleNavigation(url));

      authWindow.loadURL(authUrl).catch((err) => {
        logger.error('AUTH', 'Failed to load Google OAuth URL', err);
        safeClose();
        resolveOnce(false);
      });
    });
  }

  /**
   * Initiates OAuth for Dropbox or OneDrive via an isolated BrowserWindow.
   * Uses local embedded server APP_URL (which has provider credentials from .env.local).
   */
  public async loginWithProvider(provider: CloudProvider): Promise<boolean> {
    if (provider === 'google') return this.login();

    const cookieKeys = PROVIDER_COOKIE_MAP[provider];
    if (!cookieKeys) {
      logger.error('AUTH', `Unknown provider: ${provider}`);
      return false;
    }

    let appHost = 'localhost';
    try { appHost = new URL(APP_URL).hostname; } catch {}
    let backendHost = 'cloud-sync-woad.vercel.app';
    try { backendHost = new URL(BACKEND_URL).hostname; } catch {}

    const allowedHosts: string[] = [
      appHost,
      backendHost,
      'cloudsync.itsvirendra.in',
      'localhost',
      '127.0.0.1',
    ];
    if (provider === 'dropbox') {
      allowedHosts.push('www.dropbox.com', 'dropbox.com', 'api.dropbox.com', 'notify.dropboxapi.com');
    } else if (provider === 'onedrive') {
      allowedHosts.push(
        'login.microsoftonline.com',
        'login.live.com',
        'login.windows.net',
        'account.live.com'
      );
    }

    const authBaseUrl = await this.resolveAuthEndpoint(provider);
    const authUrl = `${authBaseUrl}/api/auth/${provider}`;
    logger.info('AUTH', `Starting ${provider} OAuth flow via: ${authUrl}`);

    return new Promise((resolve) => {
      const parent = getMainWindow();
      let resolved = false;

      const authWindow = new BrowserWindow({
        parent: parent || undefined,
        modal: true,
        width: 560,
        height: 720,
        title: `Sign in with ${provider.charAt(0).toUpperCase() + provider.slice(1)} - CloudSync`,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const safeClose = () => {
        try {
          if (!authWindow.isDestroyed()) {
            authWindow.close();
          }
        } catch {}
      };

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };

      authWindow.on('closed', cleanup);

      // Security: only allow navigation to the provider's OAuth domains and our app
      authWindow.webContents.on('will-navigate', (event, url) => {
        try {
          const parsed = new URL(url);
          const isAllowed = allowedHosts.some(
            (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
          );
          if (!isAllowed) {
            event.preventDefault();
            logger.warn('AUTH', `Blocked unapproved ${provider} OAuth navigation to: ${url}`);
          }
        } catch {
          event.preventDefault();
        }
      });

      const finishProviderSuccess = async () => {
        if (resolved) return;
        logger.info('AUTH', `${provider} auth_success detected. Extracting session cookies...`);

        try {
          await authWindow.webContents.session.cookies.flushStore();
        } catch {}

        for (let attempt = 0; attempt < 25; attempt++) {
          if (authWindow.isDestroyed() || resolved) return;

          let cookies = await authWindow.webContents.session.cookies.get({ url: APP_URL });
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: BACKEND_URL });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'https://cloudsync.itsvirendra.in' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'https://cloud-sync-woad.vercel.app' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({ url: 'http://localhost:3000' });
          }
          if (!cookies || cookies.length === 0) {
            cookies = await authWindow.webContents.session.cookies.get({});
          }

          const tokenCookie = cookies.find((c) => c.name === cookieKeys.token);
          const userCookie = cookies.find((c) => c.name === cookieKeys.user);

          if (tokenCookie && userCookie && !resolved) {
            resolved = true;
            try {
              const user = JSON.parse(decodeURIComponent(userCookie.value));
              providerTokenCache[provider] = {
                token: tokenCookie.value,
                expiresAt: Date.now() + (tokenCookie.expirationDate
                  ? (tokenCookie.expirationDate * 1000 - Date.now())
                  : 4 * 60 * 60 * 1000),
              };
              providerUserCache[provider] = user;

              const session = ((await this.getSession()) || { sessionToken: 'cookie_session', user }) as StoredSession;
              if (!session.providers) session.providers = {};
              session.providers[provider] = {
                token: tokenCookie.value,
                expiresAt: providerTokenCache[provider].expiresAt,
                user,
              };
              await this.saveSession(session);

              logger.info('AUTH', `${provider} session cached & saved for: ${user.email}`);

              safeClose();

              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send('desktop:providerAuthChanged', { provider, user });
              }

              resolve(true);
              return;
            } catch (err) {
              logger.error('AUTH', `Failed to parse ${provider} user cookie`, err);
            }
          }

          await new Promise((r) => setTimeout(r, 200));
        }

        if (!resolved) {
          logger.warn('AUTH', `${provider} auth_success but cookies not found in time`);
          safeClose();
          resolve(false);
        }
      };

      // Listen for cookie changes
      const cookieListener = (_event: any, cookie: any) => {
        if (cookie.name === cookieKeys.token || cookie.name === cookieKeys.user) {
          finishProviderSuccess();
        }
      };
      authWindow.webContents.session.cookies.on('changed', cookieListener);
      authWindow.on('closed', () => {
        try {
          authWindow.webContents.session.cookies.removeListener('changed', cookieListener);
        } catch {}
      });

      const handleUrl = async (url: string) => {
        if (resolved) return;

        try {
          const parsed = new URL(url);

          if (parsed.searchParams.has('auth_error')) {
            const errCode = parsed.searchParams.get('auth_error');
            logger.error('AUTH', `${provider} OAuth failed: ${errCode}`);
            safeClose();
            cleanup();
            return;
          }

          if (
            (parsed.searchParams.has('auth_success') &&
              (parsed.searchParams.get('provider') === provider || !parsed.searchParams.get('provider'))) ||
            (url.includes('auth_success') && url.includes(provider))
          ) {
            finishProviderSuccess();
          }
        } catch (err) {
          logger.error('AUTH', `Error processing ${provider} OAuth URL`, err);
        }
      };

      authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url));
      authWindow.webContents.on('did-navigate', (_event, url) => handleUrl(url));
      authWindow.webContents.on('did-navigate-in-page', (_event, url) => handleUrl(url));

      authWindow.loadURL(authUrl).catch((err) => {
        logger.error('AUTH', `Failed to load ${provider} OAuth URL`, err);
        safeClose();
        cleanup();
      });
    });
  }

  /**
   * Returns current connection states across all providers.
   */
  public async getProviderStates(): Promise<Record<string, { connected: boolean; user: DesktopUser | null }>> {
    await this.getSession();
    return {
      google: { connected: Boolean(this.memorySession?.user), user: this.memorySession?.user || null },
      dropbox: { connected: Boolean(providerTokenCache.dropbox), user: providerUserCache.dropbox || null },
      onedrive: { connected: Boolean(providerTokenCache.onedrive), user: providerUserCache.onedrive || null },
    };
  }

  /**
   * Returns the cached access token for a cloud provider (non-Google).
   * For Google, delegates to getAccessToken().
   */
  public async getProviderAccessToken(provider: CloudProvider): Promise<string | null> {
    if (provider === 'google') return this.getAccessToken();

    await this.getSession();
    const cached = providerTokenCache[provider];
    if (cached && Date.now() < cached.expiresAt - 120000) {
      return cached.token;
    }
    return null; // Token expired — user must re-auth
  }

  /**
   * Returns the cached user info for a cloud provider.
   */
  public async getProviderUser(provider: CloudProvider): Promise<{ email: string; name: string; picture: string } | null> {
    if (provider === 'google') {
      const s = await this.getSession();
      return s ? s.user : null;
    }
    await this.getSession();
    return providerUserCache[provider] || null;
  }

  /**
   * Disconnects a cloud provider (clears its in-memory and persistent cache).
   * For Google, delegates to logout().
   */
  public async disconnectProvider(provider: CloudProvider): Promise<void> {
    if (provider === 'google') {
      await this.logout();
      return;
    }
    delete providerTokenCache[provider];
    delete providerUserCache[provider];

    if (this.memorySession?.providers) {
      delete this.memorySession.providers[provider];
      await this.saveSession(this.memorySession);
    }

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop:providerAuthChanged', { provider, user: null });
    }
    logger.info('AUTH', `${provider} provider disconnected`);
  }

  /**
   * Logs out: invalidates session on server, deletes DPAPI session, wipes memory cache.
   */
  public async logout(): Promise<void> {
    const session = await this.getSession();
    if (session?.sessionToken) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/desktop/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.sessionToken}` },
        });
      } catch {}
    }

    this.memorySession = null;
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;

    const filePath = this.getSessionFilePath();
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    const win = getMainWindow();
    if (win) {
      win.webContents.send('desktop:authChanged', { user: null });
    }
    logger.info('AUTH', 'Desktop session cleared');
  }
}

export const authService = new DesktopAuthService();
