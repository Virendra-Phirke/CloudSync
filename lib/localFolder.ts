'use client';
import { get, set, del } from 'idb-keyval';
import ignore, { Ignore } from 'ignore';

// Legacy keys (for migration)
const LEGACY_HANDLE_KEY = 'local_sync_folder_handle';
const LEGACY_INFO_KEY   = 'local_sync_folder_info';

// New multi-folder key
const FOLDERS_KEY = 'local_sync_folders';

export interface FolderInfo {
  name: string;
  savedAt: number;
}

export interface SyncFolder {
  id: string;
  name: string;
  savedAt: number;
}

export interface SyncFolderEntry {
  id: string;
  handle: FileSystemDirectoryHandle;
  info: SyncFolder;
}

export interface LocalFile {
  /** Unique key within the folder (relative path) */
  id: string;
  name: string;
  path: string;      // relative path from root of selected folder
  size: number;      // bytes; 0 for directories
  lastModified: number;
  mimeType: string;
  isDirectory: boolean;
  /** The native file system handle, used to retrieve the actual File object later */
  handle?: any; // FileSystemFileHandle | FileSystemDirectoryHandle
}

export interface FolderStats {
  fileCount: number;
  dirCount: number;
  totalSize: number; // bytes
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Calculates the MD5 hash of a local file by reading it in chunks.
 * This matches Google Drive's md5Checksum format (hex).
 */
export async function calculateFileHash(file: File): Promise<string> {
  // Dynamic import so spark-md5 isn't loaded unless needed
  const SparkMD5 = (await import('spark-md5')).default;
  
  return new Promise((resolve, reject) => {
    const chunkSize = 2097152; // 2MB
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      if (e.target?.result) {
        spark.append(e.target.result as ArrayBuffer);
      }
      currentChunk++;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error('Failed to read file for hashing'));
    };

    function loadNext() {
      const start = currentChunk * chunkSize;
      const end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
      fileReader.readAsArrayBuffer(file.slice(start, end));
    }

    loadNext();
  });
}

// ─── Migration ────────────────────────────────────────────────────────────────

/** Migrate legacy single-folder data to new multi-folder format */
async function migrateLegacyFolder(): Promise<void> {
  try {
    const legacyHandle: FileSystemDirectoryHandle | undefined = await get(LEGACY_HANDLE_KEY);
    const legacyInfo: FolderInfo | undefined = await get(LEGACY_INFO_KEY);
    
    if (legacyHandle && legacyInfo) {
      const entry: SyncFolderEntry = {
        id: `folder-${Date.now()}`,
        handle: legacyHandle,
        info: {
          id: `folder-${Date.now()}`,
          name: legacyInfo.name,
          savedAt: legacyInfo.savedAt,
        },
      };
      entry.info.id = entry.id;
      await set(FOLDERS_KEY, [entry]);
      // Clean up legacy keys
      await del(LEGACY_HANDLE_KEY);
      await del(LEGACY_INFO_KEY);
    }
  } catch {
    // Migration failed silently — no legacy data or corrupted
  }
}

// ─── Multi-Folder CRUD ───────────────────────────────────────────────────────

/** Get all stored folder entries. Auto-migrates legacy data on first call. */
export async function getLocalFolders(): Promise<SyncFolderEntry[]> {
  try {
    let folders: SyncFolderEntry[] | undefined = await get(FOLDERS_KEY);
    
    // Try migration if no folders found
    if (!folders || folders.length === 0) {
      await migrateLegacyFolder();
      folders = await get(FOLDERS_KEY);
    }
    
    return folders || [];
  } catch {
    return [];
  }
}

/** Get folder infos without requiring permission (lightweight, for UI). */
export async function getLocalFolderInfos(): Promise<SyncFolder[]> {
  const folders = await getLocalFolders();
  return folders.map(f => f.info);
}

/** Get a specific folder entry by ID, re-requesting permission if needed. */
export async function getLocalFolderById(id: string): Promise<SyncFolderEntry | null> {
  const folders = await getLocalFolders();
  const entry = folders.find(f => f.id === id);
  if (!entry) return null;

  try {
    let perm = await (entry.handle as any).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? entry : null;
  } catch {
    return null;
  }
}

const DEFAULT_SYNCIGNORE = `# ============================================================
# ENVIRONMENT & SECRETS
# ============================================================

.env
.env.*
!.env.example
!.env.sample
*.env

.env.local
.env.development
.env.development.local
.env.test
.env.test.local
.env.production
.env.production.local

secrets/
*.secret
*.secrets
secrets.json
credentials.json
credentials.yml
credentials.yaml
service-account.json
serviceAccount.json

# Private keys / certificates
*.pem
*.key
*.p12
*.pfx
*.jks
*.keystore
*.crt
*.cer

# ============================================================
# NODE.JS
# ============================================================

node_modules/
.npm/
.npmrc
.yarn/
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
.pnpm-store/

npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

.nyc_output/
coverage/

# Package manager caches
.eslintcache
.stylelintcache

# ============================================================
# REACT
# ============================================================

build/
dist/
.cache/

# ============================================================
# NEXT.JS
# ============================================================

.next/
.next/cache/
out/

# Next.js generated files
.vercel/

# ============================================================
# OTHER JAVASCRIPT FRAMEWORKS / BUILD TOOLS
# ============================================================

.nuxt/
.svelte-kit/
.angular/
.parcel-cache/
.turbo/
.vite/
vite.config.*.timestamp-*

# Astro
.astro/

# Gatsby
.cache/
public/

# ============================================================
# TYPESCRIPT
# ============================================================

*.tsbuildinfo

# ============================================================
# PYTHON
# ============================================================

__pycache__/
*.py[cod]
*$py.class

# Python distributions
*.egg
*.egg-info/
dist/
build/
wheels/
pip-wheel-metadata/

# Virtual environments
.venv/
venv/
env/
ENV/
env.bak/
venv.bak/

# Python testing
.pytest_cache/
.coverage
.coverage.*
htmlcov/
.tox/
.nox/

# Type checkers
.mypy_cache/
.pyre/
.pytype/
.ruff_cache/

# Jupyter
.ipynb_checkpoints/

# Python packaging
.Python
pip-log.txt
pip-delete-this-directory.txt

# ============================================================
# JAVA
# ============================================================

*.class
*.jar
*.war
*.ear

target/
out/

# Java logs
hs_err_pid*
replay_pid*

# ============================================================
# GRADLE
# ============================================================

.gradle/
.gradle-cache/
build/
!gradle/wrapper/gradle-wrapper.jar

# Gradle generated files
*.gradle
!gradle/**/*.gradle

# ============================================================
# ANDROID
# ============================================================

# Android Studio / IntelliJ
.idea/
*.iml
*.ipr
*.iws

# Android build
/build
*/build/
*/build/intermediates/
*/build/generated/
*/build/kotlin/
*/build/outputs/
*/build/tmp/

# Android local configuration
local.properties

# Signing files
*.jks
*.keystore

# Google services
google-services.json

# Android generated files
.externalNativeBuild/
.cxx/
captures/

# ============================================================
# KOTLIN
# ============================================================

.kotlin/
.kotlin-build/

# ============================================================
# INTELLIJ / JETBRAINS
# ============================================================

.idea/
*.iws
*.iml
*.ipr

# IntelliJ compiler
out/

# ============================================================
# VS CODE
# ============================================================

.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# If you don't want any VS Code config tracked,
# replace the section above with:
# .vscode/

# ============================================================
# ECLIPSE
# ============================================================

.classpath
.project
.settings/

# ============================================================
# MACOS
# ============================================================

.DS_Store
.AppleDouble
.LSOverride

# Icon
Icon

# Thumbnails
._*

# ============================================================
# WINDOWS
# ============================================================

Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db
*.stackdump

# Windows installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk

# ============================================================
# LINUX
# ============================================================

*~
.directory
.Trash-*

# ============================================================
# LOGS
# ============================================================

*.log
logs/
log/

npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# ============================================================
# TEMPORARY FILES
# ============================================================

*.tmp
*.temp
*.swp
*.swo
*.swn
*.bak
*.backup
*.old
*.orig
*.rej

tmp/
temp/
.cache/

# ============================================================
# DATABASES
# ============================================================

*.db
*.sqlite
*.sqlite3
*.sqlite-journal
*.db-shm
*.db-wal

# ============================================================
# DOCKER
# ============================================================

docker-compose.override.yml
docker-compose.local.yml

# Docker environment files
docker.env
.docker.env

# Docker volumes
docker-data/
.docker-data/

# ============================================================
# KUBERNETES
# ============================================================

*.kubeconfig
kubeconfig
.kube/

# ============================================================
# TERRAFORM
# ============================================================

.terraform/
.terraform.lock.hcl
*.tfstate
*.tfstate.*
crash.log
crash.*.log

# Terraform variable files may contain secrets
*.tfvars
*.tfvars.json

# ============================================================
# SERVERLESS
# ============================================================

.serverless/
.aws-sam/

# ============================================================
# FIREBASE
# ============================================================

.firebase/
.firebaserc.local

# ============================================================
# VERCEL / NETLIFY
# ============================================================

.vercel/
.netlify/

# ============================================================
# PHP / LARAVEL (OPTIONAL)
# ============================================================

vendor/
storage/*.key
storage/logs/
bootstrap/cache/

# ============================================================
# RUBY (OPTIONAL)
# ============================================================

.bundle/
vendor/bundle/
.ruby-version
.ruby-gemset

# ============================================================
# GO (OPTIONAL)
# ============================================================

bin/
vendor/

# ============================================================
# RUST (OPTIONAL)
# ============================================================

target/
Cargo.lock

# ============================================================
# C / C++
# ============================================================

*.o
*.obj
*.a
*.lib
*.so
*.dll
*.dylib
*.exe

# ============================================================
# GENERATED DOCUMENTS / REPORTS
# ============================================================

*.pdf
*.docx
*.xlsx

# ============================================================
# API / TOOL GENERATED FILES
# ============================================================

generated/
generated-files/
codegen/
.codegen/

# ============================================================
# LOCAL CONFIGURATION
# ============================================================

*.local
*.local.json
*.local.yml
*.local.yaml

# ============================================================
# PID / SOCKET FILES
# ============================================================

*.pid
*.pid.lock
*.seed
*.pidfile
*.sock

# ============================================================
# BACKUP FILES
# ============================================================

*.orig
*.rej
*.swp
*.swo
*.bak
*.backup
*~

# ============================================================
# IDE / EDITOR
# ============================================================

.vim/
.nvim/
.emacs.d/

# ============================================================
# OS / FILE SYSTEM METADATA
# ============================================================

.DS_Store
.AppleDouble
.LSOverride
Thumbs.db
desktop.ini
ehthumbs.db

# ============================================================
# LOCAL DEVELOPMENT
# ============================================================

.local/
.localhost/
.dev/
development/

# ============================================================
# CACHES
# ============================================================

.cache/
.cache-loader/
.parcel-cache/
.eslintcache
.stylelintcache
.rswatch/

# ============================================================
# DEBUG / PROFILING
# ============================================================

*.prof
*.heapprofile
*.cpuprofile

# ============================================================
# SENTRY
# ============================================================

.sentryclirc

# ============================================================
# PLAYWRIGHT / CYPRESS
# ============================================================

test-results/
playwright-report/
blob-report/
cypress/videos/
cypress/screenshots/

# ============================================================
# STORYBOOK
# ============================================================

storybook-static/

# ============================================================
# SWAGGER / OPENAPI GENERATED
# ============================================================

swagger-generated/
openapi-generated/

# ============================================================
# LOCAL CERTIFICATES
# ============================================================

certificates/
certs/
*.csr

# ============================================================
# BACKUP / ARCHIVE FILES
# ============================================================

*.zip
*.tar
*.tar.gz
*.rar
*.7z

# ============================================================
# LARGE MEDIA / LOCAL ASSETS
# Uncomment if these should NOT be committed
# ============================================================

# *.mp4
# *.mov
# *.avi
# *.mkv
# *.psd
# *.ai

# ============================================================
# LOCAL AI / ML FILES
# Uncomment if your project uses local models
# ============================================================

# models/
# checkpoints/
# *.pt
# *.pth
# *.onnx
# *.safetensors

# ============================================================
# PROJECT-SPECIFIC LOCAL FILES
# ============================================================

*.local
*.private
*.dev

# Local notes
.notes/
.local-notes/
`;

/** Prompts user to pick a directory and adds it to the folder list. */
export async function addLocalFolder(): Promise<SyncFolderEntry | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'Your browser does not support the File System Access API. Please use Chrome or Edge.'
    );
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    
    // Initialize .syncignore if it doesn't exist
    try {
      await handle.getFileHandle('.syncignore');
    } catch {
      // File doesn't exist, create it with template
      try {
        const ignoreHandle = await handle.getFileHandle('.syncignore', { create: true });
        const writable = await ignoreHandle.createWritable();
        await writable.write(DEFAULT_SYNCIGNORE);
        await writable.close();
      } catch (err) {
        console.warn('Could not create default .syncignore:', err);
      }
    }

    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: SyncFolderEntry = {
      id,
      handle,
      info: { id, name: handle.name, savedAt: Date.now() },
    };
    
    const existing = await getLocalFolders();
    // Check if folder already exists (by name — handles can't be compared)
    const alreadyExists = existing.some(f => f.info.name === handle.name);
    if (alreadyExists) {
      throw new Error(`Folder "${handle.name}" is already added.`);
    }
    
    existing.push(entry);
    await set(FOLDERS_KEY, existing);
    return entry;
  } catch (err: any) {
    if (err.name === 'AbortError') return null; // user cancelled
    throw err;
  }
}

/** Remove a folder from the list by ID. */
export async function removeLocalFolder(id: string): Promise<void> {
  const existing = await getLocalFolders();
  const filtered = existing.filter(f => f.id !== id);
  await set(FOLDERS_KEY, filtered);
}

/** Clear all folder entries. */
export async function clearAllLocalFolders(): Promise<void> {
  await del(FOLDERS_KEY);
  // Also clean legacy keys if they exist
  await del(LEGACY_HANDLE_KEY);
  await del(LEGACY_INFO_KEY);
}

// ─── Backward Compat (single-folder access for simpler consumers) ────────────

/** Returns the first folder's handle, for backward compatibility. */
export async function getLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  const folders = await getLocalFolders();
  if (folders.length === 0) return null;
  
  const entry = folders[0];
  try {
    let perm = await (entry.handle as any).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? entry.handle : null;
  } catch {
    return null;
  }
}

/** Returns info for the first folder (backward compat). */
export async function getLocalFolderInfo(): Promise<FolderInfo | null> {
  const folders = await getLocalFolders();
  if (folders.length === 0) return null;
  return { name: folders[0].info.name, savedAt: folders[0].info.savedAt };
}

/** Legacy: prompts user and sets as the ONLY folder. Use addLocalFolder() instead. */
export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  const entry = await addLocalFolder();
  return entry ? entry.handle : null;
}

/** Legacy: clears all folders. */
export async function clearLocalFolder(): Promise<void> {
  await clearAllLocalFolders();
}

// ─── File Reading ─────────────────────────────────────────────────────────────

const MAX_DEPTH = 5;

/**
 * Reads ONLY the immediate children of a directory handle (no recursion).
 * Fast for UI rendering — doesn't traverse the full tree.
 */
export async function readFolderChildren(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  rootHandle?: FileSystemDirectoryHandle
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];

  // Load ignore rules at root level
  const ig = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']);
  try {
    const targetIgnoreHandle = rootHandle || handle;
    const ignoreHandle = await targetIgnoreHandle.getFileHandle('.syncignore');
    const ignoreFile = await ignoreHandle.getFile();
    ig.add(await ignoreFile.text());
  } catch {
    // no .syncignore, fine
  }

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;

    if (ig.ignores(path)) continue;

    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        results.push({
          id: path,
          name,
          path,
          size: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || 'application/octet-stream',
          isDirectory: false,
          handle: entry,
        });
      } catch {
        // Skip unreadable files
      }
    } else if (entry.kind === 'directory') {
      results.push({
        id: path,
        name,
        path,
        size: 0,
        lastModified: Date.now(),
        mimeType: 'application/vnd.google-apps.folder',
        isDirectory: true,
        handle: entry,
      });
    }
  }

  // Sort: folders first, then alphabetically
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Reads children of a directory handle recursively up to MAX_DEPTH.
 * Returns both files and sub-directories as LocalFile entries.
 */

export async function readFolderFiles(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0,
  ig?: Ignore
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];
  if (depth > MAX_DEPTH) return results;

  // At root, check for .syncignore
  let currentIg = ig;
  if (depth === 0) {
    currentIg = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']); // default ignores
    try {
      const ignoreHandle = await handle.getFileHandle('.syncignore');
      const ignoreFile = await ignoreHandle.getFile();
      const text = await ignoreFile.text();
      currentIg.add(text);
    } catch {
      // no .syncignore file, that's fine
    }
  }

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    
    if (currentIg && currentIg.ignores(path)) {
      continue; // Skip ignored files/folders
    }

    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        results.push({
          id: path,
          name,
          path,
          size: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || 'application/octet-stream',
          isDirectory: false,
          handle: entry,
        });
      } catch {
        // Skip unreadable files
      }
    } else if (entry.kind === 'directory') {
      results.push({
        id: path,
        name,
        path,
        size: 0,
        lastModified: Date.now(),
        mimeType: 'application/vnd.google-apps.folder',
        isDirectory: true,
        handle: entry,
      });
      // Recursively read subdirectories
      try {
        const subFiles = await readFolderFiles(entry as FileSystemDirectoryHandle, path, depth + 1, currentIg);
        results.push(...subFiles);
      } catch {
        // Skip unreadable directories
      }
    }
  }

  // Sort: folders first, then files alphabetically
  if (depth === 0) {
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }

  return results;
}

/**
 * Computes aggregate stats for the folder recursively.
 */
export async function getFolderStats(
  handle: FileSystemDirectoryHandle,
  depth = 0,
  prefix = '',
  ig?: Ignore
): Promise<FolderStats> {
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;

  if (depth > MAX_DEPTH) return { fileCount, dirCount, totalSize };

  let currentIg = ig;
  if (depth === 0) {
    currentIg = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']);
    try {
      const ignoreHandle = await handle.getFileHandle('.syncignore');
      const ignoreFile = await ignoreHandle.getFile();
      const text = await ignoreFile.text();
      currentIg.add(text);
    } catch {}
  }

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    
    if (currentIg && currentIg.ignores(path)) {
      continue;
    }

    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        fileCount++;
        totalSize += file.size;
      } catch {}
    } else if (entry.kind === 'directory') {
      dirCount++;
      try {
        const subStats = await getFolderStats(entry as FileSystemDirectoryHandle, depth + 1, path, currentIg);
        fileCount += subStats.fileCount;
        dirCount += subStats.dirCount;
        totalSize += subStats.totalSize;
      } catch {}
    }
  }

  return { fileCount, dirCount, totalSize };
}
