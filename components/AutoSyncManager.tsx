'use client';
import { useEffect, useRef, useState } from 'react';
import { getAppSettings, AppSettings } from '../lib/settings';
import { getLocalFolder } from '../lib/localFolder';
import { syncLocalFolderToDrive } from '../lib/syncEngine';
import { getAccessToken } from '../lib/oauth';

export function AutoSyncManager() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  const loadSettings = async () => {
    const s = await getAppSettings();
    setSettings(s);
  };

  useEffect(() => {
    getAppSettings().then(setSettings);

    const handleSettingsChanged = () => {
      getAppSettings().then(setSettings);
    };

    window.addEventListener('omnisync-settings-changed', handleSettingsChanged);
    return () => window.removeEventListener('omnisync-settings-changed', handleSettingsChanged);
  }, []);

  useEffect(() => {
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!settings || !settings.autoSync) return;

    const intervalMs = settings.syncIntervalMin * 60 * 1000;

    const doSync = async () => {
      if (isSyncingRef.current) return;
      
      const token = await getAccessToken();
      if (!token) return; // not logged in

      const handle = await getLocalFolder();
      if (!handle) return; // no folder selected or permission lost

      try {
        isSyncingRef.current = true;
        console.log(`[AutoSync] Starting background sync...`);
        // We pass a no-op progress callback so it doesn't spam UI, 
        // or we could show a subtle toast if we wanted.
        await syncLocalFolderToDrive(handle, (msg) => {
          // console.log(`[AutoSync] ${msg}`);
        });
        console.log(`[AutoSync] Background sync complete.`);
      } catch (err) {
        console.error('[AutoSync] Background sync failed', err);
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Schedule the timer
    console.log(`[AutoSync] Scheduled every ${settings.syncIntervalMin} minutes.`);
    timerRef.current = setInterval(doSync, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [settings]);

  return null; // Headless component
}
