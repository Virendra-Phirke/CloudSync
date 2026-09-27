#!/usr/bin/env node
/**
 * pre-commit secret scan hook
 * Runs automatically before every `git commit`.
 * Blocks commits that contain secret patterns in staged files.
 *
 * Install: copy to .git/hooks/pre-commit and chmod +x it.
 * Or run `npm run hooks:install` if configured.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  { label: 'Google OAuth Client Secret', regex: /GOCSPX-[a-zA-Z0-9_-]{20,}/ },
  { label: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
  { label: 'Dropbox App Secret (sl.)', regex: /sl\.[a-zA-Z0-9_-]{50,}/ },
  { label: 'Private Key Block', regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
  { label: 'Generic Secret Var Assignment', regex: /(?:SECRET|PASSWORD|PRIVATE_KEY)\s*[:=]\s*["'][^"']{8,}["']/ },
  { label: 'Session/JWT Secret Value', regex: /SESSION_SECRET\s*=\s*["'][^"']{16,}["']/ },
  { label: 'Azure Client Secret Pattern', regex: /client_secret\s*:\s*["'][a-zA-Z0-9._~-]{20,}["']/ },
  { label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
];

const ENV_FILE_PATTERN = /^\.env(?!\.(example|sample)$)/;
const CREDENTIAL_FILE_PATTERN = /(?:client_secret_.*\.json|service[-_]?account.*\.json|credentials\.json|firebase-applet-config\.json)$/;

let violations = [];

try {
  // Get list of staged files
  const stagedOutput = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
  const stagedFiles = stagedOutput.trim().split('\n').filter(Boolean);

  for (const file of stagedFiles) {
    // Block .env files (except .env.example)
    const basename = path.basename(file);
    if (ENV_FILE_PATTERN.test(basename)) {
      violations.push(`  🔴 ${file}: environment secrets file must not be committed`);
      continue;
    }

    // Block credential JSON files
    if (CREDENTIAL_FILE_PATTERN.test(basename)) {
      violations.push(`  🔴 ${file}: credential file must not be committed`);
      continue;
    }

    // Scan file content for secret patterns
    let content;
    try {
      // Read from git index (staged version), not working tree
      content = execSync(`git show :${file}`, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    } catch {
      continue; // Binary or unreadable file
    }

    for (const { label, regex } of SECRET_PATTERNS) {
      if (regex.test(content)) {
        violations.push(`  🔴 ${file}: contains ${label}`);
        break;
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n❌ COMMIT BLOCKED — Secrets detected in staged files:\n');
    violations.forEach(v => console.error(v));
    console.error('\n💡 To fix:');
    console.error('   1. Remove the secret value from the file');
    console.error('   2. Move it to .env.local (which is gitignored)');
    console.error('   3. Reference it via process.env.YOUR_VAR_NAME\n');
    process.exit(1);
  }

  console.log('✅ Pre-commit secret scan passed.');
  process.exit(0);
} catch (err) {
  // If the hook itself errors, fail closed (block the commit)
  console.error('❌ Pre-commit hook encountered an error:', err.message);
  process.exit(1);
}
