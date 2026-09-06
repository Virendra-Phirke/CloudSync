import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from '../utils/logger';

let serverProcess: ChildProcess | null = null;
const PROD_PORT = 38291;

function checkUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const ok = await checkUrl(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function resolveAppUrl(): Promise<string> {
  // If explicitly specified (e.g. during npm run desktop:dev)
  if (process.env.DESKTOP_DEV_URL) {
    logger.info('IPC', `Using development server URL: ${process.env.DESKTOP_DEV_URL}`);
    return process.env.DESKTOP_DEV_URL;
  }

  // If running in development mode without explicit URL
  if (!app.isPackaged && process.env.NODE_ENV === 'development') {
    const devUrl = 'http://localhost:3000';
    const isDevRunning = await checkUrl(devUrl);
    if (isDevRunning) {
      return devUrl;
    }
  }

  // Look for standalone server in potential packaged / local paths
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'standalone/server.js'),
    path.join(app.getAppPath(), 'standalone/server.js'),
    path.join(__dirname, '../standalone/server.js'),
    path.resolve(__dirname, '../../../.next/standalone/server.js'),
  ];

  let serverScript: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serverScript = p;
      break;
    }
  }

  if (!serverScript) {
    logger.warn('SYNC', 'Standalone server not found, falling back to localhost:3000');
    return 'http://localhost:3000';
  }

  const prodUrl = `http://localhost:${PROD_PORT}`;
  const alreadyRunning = await checkUrl(prodUrl);
  if (alreadyRunning) {
    logger.info('SYNC', `Embedded server already active at ${prodUrl}`);
    return prodUrl;
  }

  logger.info('SYNC', `Launching embedded standalone Next.js server: ${serverScript} on port ${PROD_PORT}`);

  try {
    // In packaged Electron, Node runtime is available via process.execPath with ELECTRON_RUN_AS_NODE=1
    // Sanitize child process environment to guarantee zero secrets are propagated
    const cleanEnv = { ...process.env };
    for (const key of Object.keys(cleanEnv)) {
      if (/SECRET|KEY|CREDENTIAL|TOKEN/i.test(key)) {
        delete cleanEnv[key];
      }
    }

    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: path.dirname(serverScript),
      env: {
        ...cleanEnv,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(PROD_PORT),
        HOSTNAME: 'localhost',
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    });

    serverProcess.on('error', (err) => {
      logger.error('ERROR', 'Failed to start embedded Next.js server', err);
    });

    const ready = await waitForServer(prodUrl);
    if (ready) {
      logger.info('SYNC', `Embedded Next.js server ready at ${prodUrl}`);
      return prodUrl;
    } else {
      logger.error('ERROR', 'Embedded server timed out during startup');
    }
  } catch (err) {
    logger.error('ERROR', 'Error spawning embedded server', err);
  }

  return prodUrl;
}

export function stopEmbeddedServer() {
  if (serverProcess) {
    try {
      logger.info('SYNC', 'Stopping embedded Next.js server');
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
}
