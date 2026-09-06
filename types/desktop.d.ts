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
      onAuthChanged?: (callback: (payload: { user: { email: string; name: string; picture: string } | null }) => void) => () => void;
      [key: string]: any;
    };
  }
}
