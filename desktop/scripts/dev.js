const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ELECTRON_DIR = path.resolve(ROOT_DIR, 'desktop/electron');
const DEV_URL = 'http://localhost:3000';

let nextProcess = null;
let electronProcess = null;

function checkUrlReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  process.stdout.write('Waiting for Next.js dev server');
  while (Date.now() - start < timeoutMs) {
    const ready = await checkUrlReady(url);
    if (ready) {
      console.log('\n Next.js dev server is ready!');
      return true;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('\n Server timed out');
  return false;
}

function cleanup() {
  console.log('\nShutting down desktop environment...');
  if (electronProcess) {
    try {
      electronProcess.kill();
    } catch {}
  }
  if (nextProcess) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${nextProcess.pid} /T /F`);
      } else {
        nextProcess.kill();
      }
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function start() {
  console.log('=== CloudSync Desktop Development Mode ===\n');

  // 1. Check if Next.js is already running
  const isAlreadyRunning = await checkUrlReady(DEV_URL);

  if (!isAlreadyRunning) {
    console.log('Starting Next.js development server...');
    const nextCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    nextProcess = spawn(nextCmd, ['next', 'dev'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PORT: '3000' },
    });
  } else {
    console.log('Detected existing Next.js server on http://localhost:3000');
  }

  // 2. Wait until dev server responds
  const isReady = await waitForServer(DEV_URL);
  if (!isReady) {
    console.error('Failed to connect to Next.js development server.');
    cleanup();
    return;
  }

  // 3. Compile desktop TypeScript
  console.log('\nCompiling Electron TypeScript...');
  try {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execSync(`${npmCmd} run build`, { cwd: ELECTRON_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to compile Electron TypeScript:', err.message);
    cleanup();
    return;
  }

  // 4. Launch Electron
  console.log('\nLaunching CloudSync Desktop Window...');
  const electronBinary = path.resolve(ELECTRON_DIR, 'node_modules/.bin/electron' + (process.platform === 'win32' ? '.cmd' : ''));

  // On Windows, spawn with shell:true and quoted paths to handle spaces in directory names.
  const spawnArgs = process.platform === 'win32'
    ? [`"${electronBinary}" "${ELECTRON_DIR}"`]
    : [electronBinary, ELECTRON_DIR];
  const spawnOpts = {
    cwd: ELECTRON_DIR,
    stdio: 'inherit',
    env: { ...process.env, DESKTOP_DEV_URL: DEV_URL },
    shell: process.platform === 'win32',
  };

  electronProcess = process.platform === 'win32'
    ? spawn(spawnArgs[0], [], spawnOpts)
    : spawn(spawnArgs[0], [spawnArgs[1]], spawnOpts);

  electronProcess.on('close', (code) => {
    console.log(`CloudSync Electron exited with code ${code}`);
    cleanup();
  });
}

start().catch((err) => {
  console.error('Fatal desktop dev error:', err);
  cleanup();
});
