# CloudSync Windows Desktop Application

CloudSync Desktop is an isolated, secure, and native Windows desktop application built with **Electron**, **TypeScript**, and **Electron Forge**, extending the existing CloudSync Next.js web application with native operating system capabilities.

---

## Architecture Overview

```text
                                CloudSync.exe
                                     │
                                Electron Main
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
  Native Filesystem             File Watcher                System Tray
  (Trusted Roots)                (chokidar)               (Windows Notify)
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                             Secure IPC Layer
                                     │
                         Electron Preload (contextBridge)
                                     │
                               window.cloudSyncDesktop
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
           Next.js Browser Mode             Electron Desktop Mode
           - Web File System API            - Desktop Handle Adapter (IPC)
           - IndexedDB                      - Native Windows File System
           - Direct User Gestures           - Background File Watcher
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
                             CloudSync Core
                                     │
                         ┌───────────┴───────────┐
                         │                       │
                    Google Drive          Sync Engine
                     (OAuth 2.0)      (Bi-Directional + Diff)
```

---

## Directory Structure

```text
desktop/
├── scripts/
│   ├── dev.js               # Dev runner: ensures Next.js dev server is up and launches Electron
│   └── build.js             # Prod runner: builds Next.js, compiles desktop TS, packages with Forge
│
└── electron/
    ├── main/
    │   ├── main.ts          # Main process entry point
    │   ├── window.ts        # BrowserWindow config, secure preferences, close-to-tray
    │   ├── ipc.ts           # Typed IPC handlers with trusted root validation
    │   ├── tray.ts          # Windows system tray and context menu
    │   └── lifecycle.ts     # Single-instance lock and graceful shutdown
    │
    ├── preload/
    │   └── preload.ts       # contextBridge script exposing window.cloudSyncDesktop
    │
    ├── services/
    │   ├── filesystem.ts    # Native filesystem with TrustedRootsManager & .syncignore
    │   ├── fileWatcher.ts   # Debounced file watcher (chokidar) with event coalescing
    │   ├── syncService.ts   # Desktop background sync state coordinator
    │   ├── notificationService.ts # Windows native desktop notification batcher
    │   └── storageService.ts# Persistent desktop settings in userData
    │
    ├── utils/
    │   ├── logger.ts        # Safe structured logging ([SYNC], [WATCHER], [IPC], redacts secrets)
    │   ├── safePath.ts      # Path traversal protection & POSIX normalization
    │   └── paths.ts         # UserData and icon path resolvers
    │
    ├── types/
    │   └── index.ts         # TypeScript contracts for IPC, events, and capabilities
    │
    ├── package.json         # Isolated Electron, Forge, and native dependencies
    ├── forge.config.js      # Electron Forge Windows Squirrel and Zip maker config
    ├── tsconfig.json        # Isolated TypeScript compiler configuration
    └── README.md            # This documentation
```

---

## Security Model

1. **Context Isolation**:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: false` (to permit preload `contextBridge` communication)
2. **Zero Node Exposure**:
   - `fs`, `path`, `child_process`, `shell`, `require`, and `process` are never accessible in the renderer.
   - Renderer interactions strictly go through `window.cloudSyncDesktop`.
3. **Trusted Root Permission Model**:
   - When a folder is picked via Windows dialog, it is assigned a cryptographic `rootId` in Electron Main.
   - The renderer only receives `{ rootId, name }`.
   - All filesystem IPC calls reference `rootId` and `relativePath`.
   - Electron Main validates that the target path does not escape the trusted root directory via `resolveSafePath`.
4. **OAuth Security**:
   - `GOOGLE_CLIENT_SECRET` remains exclusively on the server side (`/api/auth/*`) and is never baked into the desktop client or exposed via `NEXT_PUBLIC_*`.

---

## Available Commands

From the root project directory:

### Run in Development
```bash
npm run desktop:dev
```
- Checks if `http://localhost:3000` is running; if not, automatically starts the Next.js development server.
- Polls the server until ready.
- Compiles desktop TypeScript and launches the Electron application.
- Automatically cleans up child processes upon exit.

### Build Windows Installer
```bash
npm run desktop:build
```
- Compiles the Next.js production bundle.
- Compiles desktop TypeScript (`desktop/electron`).
- Packages the application with Electron Forge into a Windows distributable located in `desktop/electron/out/`.

---

## Native Features

- **Windows System Tray**:
  - Live status indicator (e.g. `✓ Synced`, `Syncing with Google Drive...`).
  - "Open CloudSync", "Sync Now", "Open Sync Folder", and "Quit CloudSync".
  - Closing the main window minimizes to the tray for uninterrupted background file synchronization.
- **Background File Watcher**:
  - Debounced file monitoring via `chokidar`.
  - Coalesces rapid editor saves into single debounced change events (800ms quiet window).
  - Automatically respects `.syncignore` rules.
- **Single-Instance Enforcement**:
  - Only one instance of CloudSync can run simultaneously. Launching a second instance restores and focuses the active window.
- **Serialized Sync Engine**:
  - Ensures manual sync clicks, file watcher triggers, and tray triggers are queued and never execute concurrently.
