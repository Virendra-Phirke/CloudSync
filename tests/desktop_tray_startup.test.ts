import test from 'node:test';
import assert from 'node:assert';
import {
  isDesktop,
  getStartupSettings,
  setStartupSettings,
  quitDesktopApp,
  hideDesktopWindow,
} from '../lib/desktopAdapter';

test('Desktop Adapter - browser environment fallback', async () => {
  // When window.cloudSyncDesktop is undefined, isDesktop() returns false
  const originalWindow = (global as any).window;
  (global as any).window = {};

  assert.strictEqual(isDesktop(), false);
  assert.strictEqual(await getStartupSettings(), null);
  assert.strictEqual(await setStartupSettings(true), false);

  (global as any).window = originalWindow;
});

test('Desktop Adapter - startup settings delegator in electron environment', async () => {
  let openAtLoginRecorded = false;
  let openAsHiddenRecorded = false;
  let quitCalled = false;
  let hideCalled = false;

  (global as any).window = {
    cloudSyncDesktop: {
      isDesktop: true,
      platform: 'win32',
      startup: {
        getSettings: async () => ({
          openAtLogin: openAtLoginRecorded,
          openAsHidden: openAsHiddenRecorded,
        }),
        setSettings: async (settings: { openAtLogin: boolean; openAsHidden?: boolean }) => {
          openAtLoginRecorded = settings.openAtLogin;
          openAsHiddenRecorded = Boolean(settings.openAsHidden);
          return true;
        },
      },
      quitApp: async () => {
        quitCalled = true;
      },
      hideWindow: async () => {
        hideCalled = true;
      },
    },
  };

  assert.strictEqual(isDesktop(), true);

  // Initial read
  const initial = await getStartupSettings();
  assert.deepStrictEqual(initial, { openAtLogin: false, openAsHidden: false });

  // Update setting to enable startup
  const updateResult = await setStartupSettings(true, true);
  assert.strictEqual(updateResult, true);

  const updated = await getStartupSettings();
  assert.deepStrictEqual(updated, { openAtLogin: true, openAsHidden: true });

  // Test hide desktop window
  await hideDesktopWindow();
  assert.strictEqual(hideCalled, true);

  // Test quit desktop app
  await quitDesktopApp();
  assert.strictEqual(quitCalled, true);

  delete (global as any).window;
});

test('Desktop Eco Mode - handles background transitions and GC trigger', async () => {
  let gcTriggered = false;
  let backgroundState = false;

  (global as any).window = {
    cloudSyncDesktop: {
      isDesktop: true,
      onBackgroundModeChanged: (callback: (payload: { inBackground: boolean }) => void) => {
        return (state: boolean) => callback({ inBackground: state });
      },
    },
    gc: () => {
      gcTriggered = true;
    },
  };

  // Simulate listener callback subscription
  const trigger = (global as any).window.cloudSyncDesktop.onBackgroundModeChanged(
    (payload: { inBackground: boolean }) => {
      backgroundState = payload.inBackground;
      if (payload.inBackground && typeof (global as any).window.gc === 'function') {
        (global as any).window.gc();
      }
    }
  );

  // Trigger entering background eco mode
  trigger(true);
  assert.strictEqual(backgroundState, true);
  assert.strictEqual(gcTriggered, true);

  // Trigger foreground resume
  trigger(false);
  assert.strictEqual(backgroundState, false);

  delete (global as any).window;
});

test('Filesystem Sandbox - resolveSafePath protects against traversal and prefix collision', async () => {
  const { resolveSafePath, toPosixPath } = await import('../desktop/electron/utils/safePath');
  const base = process.platform === 'win32' ? 'C:\\UserFolder\\SyncRoot' : '/home/user/SyncRoot';

  // Valid child paths
  const resolvedChild = resolveSafePath(base, 'nested/file.txt');
  assert.ok(toPosixPath(resolvedChild).toLowerCase().includes('syncroot/nested/file.txt'));

  // Traversal attack (..)
  assert.throws(() => resolveSafePath(base, '../../outside.txt'), /Path traversal violation/);

  // Prefix collision attack (e.g. SyncRootEvil)
  assert.throws(() => resolveSafePath(base, '../SyncRootEvil/payload.exe'), /Path traversal violation/);

  // Null byte injection attack
  assert.throws(() => resolveSafePath(base, 'file\0.txt'), /null bytes/);
});
