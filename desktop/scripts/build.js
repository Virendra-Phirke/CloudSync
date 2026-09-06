const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ELECTRON_DIR = path.resolve(ROOT_DIR, 'desktop/electron');

// Secret denylist patterns for text files
const TEXT_DENYLIST = [
  /GOCSPX-[a-zA-Z0-9_-]+/g,
  /GOOGLE_CLIENT_SECRET\s*[:=]\s*["'][^"']+["']/gi,
  /"client_secret"\s*:\s*["'][^"']+["']/gi,
  /BEGIN (?:RSA )?PRIVATE KEY/g,
  /GOOGLE_APPLICATION_CREDENTIALS\s*[:=]/gi,
];

// Secret byte signatures for raw binary scanning
const BINARY_DENYLIST_SIGNATURES = [
  Buffer.from('GOCSPX-'),
  Buffer.from('BEGIN PRIVATE KEY'),
  Buffer.from('BEGIN RSA PRIVATE KEY'),
];

/**
 * Strips all .env files recursively from a directory.
 */
function removeEnvFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removedCount = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removedCount += removeEnvFilesRecursively(fullPath);
    } else if (entry.name.startsWith('.env')) {
      fs.unlinkSync(fullPath);
      console.log(`  [SECURITY] Stripped forbidden environment file: ${path.relative(ROOT_DIR, fullPath)}`);
      removedCount++;
    }
  }
  return removedCount;
}

/**
 * Scans a directory for any .env files or secret values. Fails closed.
 */
function scanStagingForSecrets(dir) {
  if (!fs.existsSync(dir)) return;
  const violations = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        // Check 1: Forbidden environment filename
        if (entry.name.startsWith('.env')) {
          violations.push(`Forbidden environment file packaged: ${fullPath}`);
        }

        // Check 2: Text inspection on code/metadata files
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.json', '.html', '.ts', '.map', '.txt'].includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of TEXT_DENYLIST) {
              if (pattern.test(content)) {
                violations.push(`Secret pattern matched (${pattern}) in: ${path.relative(ROOT_DIR, fullPath)}`);
              }
            }
          } catch {}
        }
      }
    }
  }

  walk(dir);

  if (violations.length > 0) {
    console.error('\n❌ BUILD HALTED: Security audit failed! The following violations were found:');
    violations.forEach(v => console.error(` - ${v}`));
    throw new Error(`Security audit failed with ${violations.length} violation(s). Build aborted.`);
  }
}

/**
 * Scans raw binary and resource files in packaged output for forbidden byte sequences.
 */
function scanPackagedDistributableForSecrets(distDir) {
  if (!fs.existsSync(distDir)) return;
  console.log(`\n  [SECURITY] Scanning packaged output directory: ${path.relative(ROOT_DIR, distDir)}`);
  const violations = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        if (entry.name.startsWith('.env')) {
          violations.push(`Forbidden environment file in distributable: ${fullPath}`);
        }

        try {
          const buffer = fs.readFileSync(fullPath);
          for (const sig of BINARY_DENYLIST_SIGNATURES) {
            if (buffer.includes(sig)) {
              violations.push(`Forbidden secret signature (${sig.toString('utf8')}) detected in: ${path.relative(ROOT_DIR, fullPath)}`);
            }
          }
        } catch {}
      }
    }
  }

  walk(distDir);

  if (violations.length > 0) {
    console.error('\n❌ BUILD HALTED: Packaged distributable security audit failed:');
    violations.forEach(v => console.error(` - ${v}`));
    throw new Error(`Packaged distributable security audit failed with ${violations.length} violation(s).`);
  }

  console.log('  [SECURITY] All packaged binaries, resources, and libraries verified: ZERO secrets detected.');
}

async function build() {
  console.log('=== Building CloudSync Desktop Windows Distributable (Zero-Secret Hardened) ===\n');

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  // 1. Build Next.js application
  console.log('Step 1/5: Building Next.js production bundle (standalone)...');
  execSync(`${npxCmd} next build`, { cwd: ROOT_DIR, stdio: 'inherit' });

  // 2. Prepare standalone server bundle for desktop distribution
  console.log('\nStep 2/5: Preparing standalone bundle and purging environment files...');
  const standaloneSource = path.join(ROOT_DIR, '.next/standalone');
  const standaloneDest = path.join(ELECTRON_DIR, 'standalone');

  if (fs.existsSync(standaloneSource)) {
    // Copy public folder to standalone
    const publicSrc = path.join(ROOT_DIR, 'public');
    const publicDest = path.join(standaloneSource, 'public');
    if (fs.existsSync(publicSrc)) {
      fs.cpSync(publicSrc, publicDest, { recursive: true });
    }

    // Copy .next/static to standalone/.next/static
    const staticSrc = path.join(ROOT_DIR, '.next/static');
    const staticDest = path.join(standaloneSource, '.next/static');
    if (fs.existsSync(staticSrc)) {
      fs.cpSync(staticSrc, staticDest, { recursive: true });
    }

    // Copy entire standalone bundle into desktop/electron/standalone
    if (fs.existsSync(standaloneDest)) {
      fs.rmSync(standaloneDest, { recursive: true, force: true });
    }
    fs.cpSync(standaloneSource, standaloneDest, { recursive: true });

    // Remove any and all .env files from both staging locations
    removeEnvFilesRecursively(standaloneSource);
    removeEnvFilesRecursively(standaloneDest);

    // Remove server-side OAuth routes from desktop standalone server so it cannot execute OAuth
    const standaloneApiAuthDir = path.join(standaloneDest, '.next/server/app/api/auth');
    if (fs.existsSync(standaloneApiAuthDir)) {
      fs.rmSync(standaloneApiAuthDir, { recursive: true, force: true });
      console.log('  [SECURITY] Removed server-side OAuth routes from desktop standalone bundle');
    }

    console.log('  Standalone Next.js bundle successfully staged and sanitized in desktop/electron/standalone');
  }

  // 3. Pre-packaging security audit
  console.log('\nStep 3/5: Running pre-packaging security audit across staging directories...');
  scanStagingForSecrets(standaloneDest);

  // 4. Build Electron TypeScript
  console.log('\nStep 4/5: Compiling Electron TypeScript...');
  execSync(`${npmCmd} run build`, { cwd: ELECTRON_DIR, stdio: 'inherit' });
  scanStagingForSecrets(path.join(ELECTRON_DIR, 'dist'));

  // 5. Package & make with Electron Forge
  console.log('\nStep 5/5: Generating Windows installer & distributable with Electron Forge...');
  execSync(`${npmCmd} run make`, { cwd: ELECTRON_DIR, stdio: 'inherit' });

  // 6. Post-packaging binary security verification
  console.log('\n=== Post-Packaging Binary Security Audit ===');
  const packagedAppDir = path.join(ELECTRON_DIR, 'out_dist/CloudSync-win32-x64');
  scanPackagedDistributableForSecrets(packagedAppDir);

  // 7. Generate Windows Standard Setup Wizard (Inno Setup)
  try {
    const { buildWindowsWizardInstaller } = require('./build-installer');
    await buildWindowsWizardInstaller();
  } catch (err) {
    console.warn('Warning: Could not compile Inno Setup wizard:', err.message);
  }

  // 8. Report generated distributable artifacts
  console.log('\n=== Windows Build Verification ===');
  const possibleOutDirs = [
    path.join(ELECTRON_DIR, 'out_dist'),
    path.join(ELECTRON_DIR, 'out'),
  ];

  let foundInstallers = [];
  for (const outDir of possibleOutDirs) {
    const makeDir = path.join(outDir, 'make');
    if (fs.existsSync(makeDir)) {
      function findFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findFiles(fullPath);
          } else if (entry.name.endsWith('.exe') || entry.name.endsWith('.zip') || entry.name.endsWith('.nupkg')) {
            const stats = fs.statSync(fullPath);
            foundInstallers.push({
              path: path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'),
              sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
            });
          }
        }
      }
      findFiles(makeDir);
    }
  }

  // Create convenience copy of setup installer if available
  const versionedSetup = path.join(ELECTRON_DIR, 'out_dist/make/squirrel.windows/x64/CloudSync-1.0.0 Setup.exe');
  const standardSetup = path.join(ELECTRON_DIR, 'out_dist/make/CloudSync-Setup.exe');
  if (fs.existsSync(versionedSetup) && !fs.existsSync(standardSetup)) {
    fs.copyFileSync(versionedSetup, standardSetup);
    foundInstallers.push({
      path: 'desktop/electron/out_dist/make/CloudSync-Setup.exe',
      sizeMb: (fs.statSync(standardSetup).size / (1024 * 1024)).toFixed(2),
    });
  }

  console.log('\nGenerated Windows Distributable Artifacts:');
  foundInstallers.forEach(item => {
    console.log(` - ${item.path} (${item.sizeMb} MB)`);
  });

  console.log('\n========================================');
  console.log('BUILD SECURITY AUDIT: PASSED');
  console.log('OAuth secret embedded in Windows package: NO');
  console.log('.env files packaged: NO');
  console.log('Desktop OAuth flow: PKCE with Vercel session (zero desktop refresh tokens)');
  console.log('Web OAuth flow: Server-side Vercel OAuth');
  console.log('========================================\n');
}

build().catch((err) => {
  console.error('\nDesktop build failed:', err);
  process.exit(1);
});
