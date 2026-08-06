/**
 * postinstall.js
 *
 * Workaround for Next.js 15.1.x + Tailwind CSS v4 on Windows:
 * Next's webpack CSS sandbox can't find native binaries via package resolution
 * — it falls back to relative paths that don't exist after a plain npm install.
 *
 * This script copies the two required native binaries to the expected
 * relative locations so the fallback paths work inside the webpack sandbox.
 */

const fs = require('fs');
const path = require('path');

if (process.platform === 'win32' && process.arch === 'x64') {
  // 1. lightningcss binary
  const lightningcssSrc = path.join(
    __dirname, '..', 'node_modules',
    'lightningcss-win32-x64-msvc',
    'lightningcss.win32-x64-msvc.node'
  );
  const lightningcssDest = path.join(
    __dirname, '..', 'node_modules',
    'lightningcss',
    'lightningcss.win32-x64-msvc.node'
  );

  if (fs.existsSync(lightningcssSrc)) {
    fs.copyFileSync(lightningcssSrc, lightningcssDest);
    console.log('[postinstall] ✓ Copied lightningcss native binary.');
  } else {
    console.warn('[postinstall] ⚠ lightningcss-win32-x64-msvc binary not found, skipping.');
  }

  // 2. @tailwindcss/oxide binary
  const oxideSrc = path.join(
    __dirname, '..', 'node_modules',
    '@tailwindcss', 'oxide-win32-x64-msvc',
    'tailwindcss-oxide.win32-x64-msvc.node'
  );
  const oxideDest = path.join(
    __dirname, '..', 'node_modules',
    '@tailwindcss', 'oxide',
    'tailwindcss-oxide.win32-x64-msvc.node'
  );

  if (fs.existsSync(oxideSrc)) {
    fs.copyFileSync(oxideSrc, oxideDest);
    console.log('[postinstall] ✓ Copied @tailwindcss/oxide native binary.');
  } else {
    console.warn('[postinstall] ⚠ @tailwindcss/oxide-win32-x64-msvc binary not found, skipping.');
  }
}
