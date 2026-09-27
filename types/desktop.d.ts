export {};

declare global {
  interface Window {
    cloudSyncDesktop?: {
      isDesktop: boolean;
      platform: string;
      auth?: {
        login: () => Promise<boolean>;
        logout: () => Promise<void>;
        getSession: () => Promise<{ email: string; name: string; picture: string } | null>;
        getAccessToken: () => Promise<string | null>;
      };
      startup?: {
        getSettings: () => Promise<{ openAtLogin: boolean; openAsHidden: boolean }>;
        setSettings: (settings: { openAtLogin: boolean; openAsHidden?: boolean }) => Promise<boolean>;
      };
      quitApp?: () => Promise<void>;
      hideWindow?: () => Promise<void>;
      showWindow?: () => Promise<void>;
      updateTrayStatus?: (status: string) => Promise<void>;
      onAuthChanged?: (callback: (payload: { user: { email: string; name: string; picture: string } | null }) => void) => () => void;
      onBackgroundModeChanged?: (callback: (payload: { inBackground: boolean }) => void) => () => void;
      onSyncTrigger?: (callback: () => void) => () => void;
      onFolderEvent?: (callback: (event: any) => void) => () => void;
      [key: string]: any;
    };
  }
}
