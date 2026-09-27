import { BrowserWindow, safeStorage, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMainWindow } from '../main/window';
import { logger } from '../utils/logger';

const BACKEND_URL = process.env.CLOUDSYNC_BACKEND_URL || 'https://cloud-sync-woad.vercel.app';

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

interface StoredSession {
  sessionToken: string;
  user: DesktopUser;
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
      return this.memorySession;
    } catch (err) {
      logger.error('AUTH', 'Failed to read/decrypt desktop session file', err);
      return null;
    }
  }

  /**
   * Saves the CloudSync session token into OS-backed safeStorage.
   */
  private async saveSession(session: StoredSession): Promise<void> {
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
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = `${BACKEND_URL}/api/auth/google`;

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
        try { if (!authWindow.isDestroyed()) authWindow.close(); } catch {}
      };

      const resolveOnce = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      authWindow.on('closed', () => resolveOnce(false));

      // Security: Only allow navigation to Google OAuth domains and the CloudSync backend
      authWindow.webContents.on('will-navigate', (event, url) => {
        try {
          const parsed = new URL(url);
          const isGoogle =
            parsed.hostname === 'google.com' ||
            parsed.hostname.endsWith('.google.com') ||
            parsed.hostname.includes('.google.') ||
            parsed.hostname.endsWith('.googleusercontent.com') ||
            parsed.hostname.endsWith('.gstatic.com');
          const isBackend =
            parsed.hostname === new URL(BACKEND_URL).hostname ||
            parsed.hostname === 'localhost';

          if (!isGoogle && !isBackend) {
            event.preventDefault();
            logger.warn('AUTH', `Blocked unapproved OAuth navigation to: ${url}`);
          }
        } catch {
          event.preventDefault();
        }
      });

      /**
       * Reads cookies from the auth window session and extracts g_access_token + g_user.
       * Uses flushStore() to guarantee the OS cookie store has been written.
       */
      const extractSessionCookies = async (): Promise<{ user: DesktopUser; token: string } | null> => {
        // Flush the cookie store to ensure Set-Cookie headers are committed
        try {
          await authWindow.webContents.session.cookies.flushStore();
        } catch {}

        for (let attempt = 0; attempt < 20; attempt++) {
          let cookies = await authWindow.webContents.session.cookies.get({ url: BACKEND_URL });
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
              return null;
            }
          }

          await new Promise((r) => setTimeout(r, 300));
        }

        return null;
      };

      /**
       * Called when the auth window navigates to a URL we need to handle.
       * IMPORTANT: We handle auth_success ONLY on did-navigate (not will-redirect)
       * because Set-Cookie headers are committed to the session only after the
       * full HTTP response has been processed.
       */
      const handleNavigation = async (url: string, source: 'will-redirect' | 'did-navigate') => {
        if (resolved) return;

        try {
          const parsed = new URL(url);

          // Error path — handle immediately regardless of source
          if (parsed.searchParams.has('auth_error')) {
            const errCode = parsed.searchParams.get('auth_error');
            logger.error('AUTH', `OAuth failed with error code: ${errCode}`);
            resolveOnce(false);
            safeClose();
            return;
          }

          // Success path — ONLY extract cookies on did-navigate, not will-redirect,
          // because cookies from the backend redirect are not yet in the session store
          // when will-redirect fires.
          if (parsed.searchParams.has('auth_success')) {
            if (source === 'will-redirect') {
              // Just log; wait for did-navigate to fire with cookies committed
              logger.info('AUTH', 'auth_success detected in will-redirect — waiting for did-navigate...');
              return;
            }

            // did-navigate: cookies should now be available
            resolved = true;
            logger.info('AUTH', 'auth_success on did-navigate. Extracting session cookies...');

            const result = await extractSessionCookies();
            if (result) {
              this.cachedAccessToken = result.token;
              this.tokenExpiresAt = Date.now() + 3500 * 1000;

              await this.saveSession({ sessionToken: 'cookie_session', user: result.user });

              safeClose();

              // Notify the main window immediately — triggers initAuth onSuccess
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send('desktop:authChanged', { user: result.user });
              }

              logger.info('AUTH', `Google login successful for: ${result.user.email}`);
              resolve(true);
            } else {
              logger.warn('AUTH', 'auth_success received but cookies not found after 6s');
              safeClose();
              resolve(false);
            }
            return;
          }

          // Desktop PKCE exchange path (if backend uses /api/auth/desktop/success)
          if (parsed.pathname === '/api/auth/desktop/success') {
            const code = parsed.searchParams.get('code');
            const returnState = parsed.searchParams.get('state');

            if (returnState !== state || !code) {
              logger.error('AUTH', 'Invalid state or missing code in desktop OAuth callback');
              resolveOnce(false);
              safeClose();
              return;
            }

            safeClose();

            const exchangeRes = await fetch(`${BACKEND_URL}/api/auth/desktop/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, verifier: codeVerifier }),
            });

            if (!exchangeRes.ok) {
              resolveOnce(false);
              return;
            }

            const data = await exchangeRes.json() as {
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
          logger.error('AUTH', 'Error processing OAuth callback URL', err);
        }
      };

      // will-redirect: good for catching error responses early; NOT for reading cookies
      authWindow.webContents.on('will-redirect', (_event, url) => {
        handleNavigation(url, 'will-redirect');
      });

      // did-navigate: fires after page load and cookie commit — use this for cookie extraction
      authWindow.webContents.on('did-navigate', (_event, url) => {
        handleNavigation(url, 'did-navigate');
      });

      authWindow.loadURL(authUrl).catch((err) => {
        logger.error('AUTH', 'Failed to load Google OAuth URL', err);
        resolveOnce(false);
      });
    });
  }

  /**
   * Initiates OAuth for Dropbox or OneDrive via an isolated BrowserWindow.
   * Follows the same cookie-intercept pattern as Google login.
   */
  public async loginWithProvider(provider: CloudProvider): Promise<boolean> {
    if (provider === 'google') return this.login();

    const cookieKeys = PROVIDER_COOKIE_MAP[provider];
    if (!cookieKeys) {
      logger.error('AUTH', `Unknown provider: ${provider}`);
      return false;
    }

    // Determine allowed hostnames for this provider's auth flow
    const allowedHosts: string[] = [
      new URL(BACKEND_URL).hostname,
      'localhost',
    ];
    if (provider === 'dropbox') {
      allowedHosts.push('www.dropbox.com', 'dropbox.com', 'notify.dropboxapi.com');
    } else if (provider === 'onedrive') {
      allowedHosts.push(
        'login.microsoftonline.com',
        'login.live.com',
        'login.windows.net',
        'account.live.com',
      );
    }

    const authUrl = `${BACKEND_URL}/api/auth/${provider}`;
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

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };

      authWindow.on('closed', cleanup);

      // Security: only allow navigation to the provider's OAuth domains and our backend
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

      const handleUrl = async (url: string) => {
        if (resolved) return;

        try {
          const parsed = new URL(url);

          if (parsed.searchParams.has('auth_error')) {
            const errCode = parsed.searchParams.get('auth_error');
            logger.error('AUTH', `${provider} OAuth failed: ${errCode}`);
            resolved = true;
            try { authWindow.close(); } catch {}
            resolve(false);
            return;
          }

          if (
            parsed.searchParams.has('auth_success') &&
            (parsed.searchParams.get('provider') === provider || !parsed.searchParams.get('provider'))
          ) {
            resolved = true;
            logger.info('AUTH', `${provider} auth_success received. Extracting session cookies...`);

            // Poll for cookies — give the browser time to set them
            for (let attempt = 0; attempt < 15; attempt++) {
              let cookies = await authWindow.webContents.session.cookies.get({ url: BACKEND_URL });
              if (!cookies || cookies.length === 0) {
                cookies = await authWindow.webContents.session.cookies.get({});
              }

              const tokenCookie = cookies.find((c) => c.name === cookieKeys.token);
              const userCookie = cookies.find((c) => c.name === cookieKeys.user);

              if (tokenCookie && userCookie) {
                const user = JSON.parse(decodeURIComponent(userCookie.value));

                // Cache in memory
                providerTokenCache[provider] = {
                  token: tokenCookie.value,
                  expiresAt: Date.now() + (tokenCookie.expirationDate
                    ? (tokenCookie.expirationDate * 1000 - Date.now())
                    : 4 * 60 * 60 * 1000), // default 4h
                };
                providerUserCache[provider] = user;

                logger.info('AUTH', `${provider} session cached in memory for: ${user.email}`);

                try { authWindow.close(); } catch {}

                const win = getMainWindow();
                if (win && !win.isDestroyed()) {
                  win.webContents.send('desktop:providerAuthChanged', { provider, user });
                }

                resolve(true);
                return;
              }

              await new Promise((r) => setTimeout(r, 300));
            }

            logger.warn('AUTH', `${provider} auth_success but cookies not found in time`);
            try { authWindow.close(); } catch {}
            resolve(false);
          }
        } catch (err) {
          logger.error('AUTH', `Error processing ${provider} OAuth callback URL`, err);
        }
      };

      authWindow.webContents.on('will-redirect', (_event, url) => handleUrl(url));
      authWindow.webContents.on('did-navigate', (_event, url) => handleUrl(url));

      authWindow.loadURL(authUrl).catch((err) => {
        logger.error('AUTH', `Failed to load ${provider} OAuth URL`, err);
        cleanup();
      });
    });
  }

  /**
   * Returns the cached access token for a cloud provider (non-Google).
   * For Google, delegates to getAccessToken().
   */
  public async getProviderAccessToken(provider: CloudProvider): Promise<string | null> {
    if (provider === 'google') return this.getAccessToken();

    const cached = providerTokenCache[provider];
    if (cached && Date.now() < cached.expiresAt - 120000) {
      return cached.token;
    }
    return null; // Token expired — user must re-auth
  }

  /**
   * Returns the cached user info for a cloud provider.
   */
  public getProviderUser(provider: CloudProvider): { email: string; name: string; picture: string } | null {
    if (provider === 'google') {
      const s = this.memorySession;
      return s ? s.user : null;
    }
    return providerUserCache[provider] || null;
  }

  /**
   * Disconnects a cloud provider (clears its in-memory cache).
   * For Google, delegates to logout().
   */
  public async disconnectProvider(provider: CloudProvider): Promise<void> {
    if (provider === 'google') {
      await this.logout();
      return;
    }
    delete providerTokenCache[provider];
    delete providerUserCache[provider];

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
