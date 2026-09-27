export {};

declare global {
  interface Window {
    cloudSyncDesktop?: {
      isDesktop: boolean;
      platform: string;
      auth?: {
        login: () => Promise<boolean>;
        loginWithProvider: (provider: string) => Promise<boolean>;
        logout: () => Promise<void>;
        getSession: () => Promise<{ email: string; name: string; picture: string } | null>;
        getAccessToken: () => Promise<string | null>;
        getProviderAccessToken: (provider: string) => Promise<string | null>;
        getProviderStates: () => Promise<Record<string, { connected: boolean; user: { email: string; name: string; picture: string } | null }>>;
        disconnectProvider: (provider: string) => Promise<void>;
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
      onProviderAuthChanged?: (callback: (payload: { provider: string; user: { email: string; name: string; picture: string } | null }) => void) => () => void;
      onBackgroundModeChanged?: (callback: (payload: { inBackground: boolean }) => void) => () => void;
      onSyncTrigger?: (callback: () => void) => () => void;
      onFolderEvent?: (callback: (event: any) => void) => () => void;
      [key: string]: any;
    };
  }
}
