import { BrowserWindow, safeStorage, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMainWindow } from '../main/window';
import { logger } from '../utils/logger';

const BACKEND_URL = process.env.CLOUDSYNC_BACKEND_URL || 'https://cloud-sync-woad.vercel.app';

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
   */
  public async login(): Promise<boolean> {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    // Use live deployed Google OAuth initiation route
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

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };

      authWindow.on('closed', cleanup);

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

      // Intercept navigation to success/error callback
      const checkNavigation = async (url: string) => {
        if (resolved) return;

        try {
          const parsed = new URL(url);

          // Handle user cancel or server auth error
          if (parsed.searchParams.has('auth_error')) {
            const errCode = parsed.searchParams.get('auth_error');
            logger.error('AUTH', `OAuth failed with error code: ${errCode}`);
            resolved = true;
            try { authWindow.close(); } catch {}
            resolve(false);
            return;
          }

          // Handle live deployed Vercel callback (redirects to /?auth_success=1)
          if (parsed.searchParams.has('auth_success')) {
            resolved = true;
            logger.info('AUTH', 'Authentication succeeded on backend. Retrieving session...');

            for (let attempt = 0; attempt < 10; attempt++) {
              let cookies = await authWindow.webContents.session.cookies.get({
                url: BACKEND_URL,
              });
              if (!cookies || cookies.length === 0) {
                cookies = await authWindow.webContents.session.cookies.get({
                  domain: parsed.hostname,
                });
              }
              if (!cookies || cookies.length === 0) {
                cookies = await authWindow.webContents.session.cookies.get({});
              }

              const accessTokenCookie = cookies.find((c) => c.name === 'g_access_token');
              const userCookie = cookies.find((c) => c.name === 'g_user');

              if (accessTokenCookie && userCookie) {
                const user = JSON.parse(decodeURIComponent(userCookie.value)) as DesktopUser;
                this.cachedAccessToken = accessTokenCookie.value;
                this.tokenExpiresAt = Date.now() + 3500 * 1000;

                await this.saveSession({
                  sessionToken: 'cookie_session',
                  user,
                });

                try {
                  authWindow.close();
                } catch {}

                const win = getMainWindow();
                if (win) {
                  win.webContents.send('desktop:authChanged', { user });
                }

                resolve(true);
                return;
              }

              await new Promise((r) => setTimeout(r, 200));
            }

            logger.warn('AUTH', 'auth_success detected but session cookies were not retrieved in time');
            try { authWindow.close(); } catch {}
            resolve(false);
            return;
          }

          // Handle dedicated PKCE desktop success route if active
          if (parsed.pathname === '/api/auth/desktop/success') {
            const code = parsed.searchParams.get('code');
            const returnState = parsed.searchParams.get('state');

            if (returnState !== state || !code) {
              logger.error('AUTH', 'Invalid state or missing code in desktop OAuth callback');
              resolved = true;
              authWindow.close();
              resolve(false);
              return;
            }

            authWindow.close();

            const exchangeRes = await fetch(`${BACKEND_URL}/api/auth/desktop/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, verifier: codeVerifier }),
            });

            if (!exchangeRes.ok) {
              resolved = true;
              resolve(false);
              return;
            }

            const data = await exchangeRes.json() as {
              sessionToken: string;
              user: DesktopUser;
              accessToken: string;
            };

            await this.saveSession({
              sessionToken: data.sessionToken,
              user: data.user,
            });

            this.cachedAccessToken = data.accessToken;
            this.tokenExpiresAt = Date.now() + 3500 * 1000;

            const win = getMainWindow();
            if (win) {
              win.webContents.send('desktop:authChanged', { user: data.user });
            }

            resolved = true;
            resolve(true);
            return;
          }
        } catch (err) {
          logger.error('AUTH', 'Error processing OAuth callback URL', err);
        }
      };

      authWindow.webContents.on('will-redirect', (_event, url) => {
        checkNavigation(url);
      });

      authWindow.webContents.on('did-navigate', (_event, url) => {
        checkNavigation(url);
      });

      authWindow.loadURL(authUrl).catch((err) => {
        logger.error('AUTH', 'Failed to load desktop OAuth URL', err);
        cleanup();
      });
    });
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
