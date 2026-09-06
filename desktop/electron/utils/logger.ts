type LogScope =
  | 'SYNC'
  | 'FILE-WATCHER'
  | 'GOOGLE-DRIVE'
  | 'IPC'
  | 'AUTH'
  | 'FILESYSTEM'
  | 'TRAY'
  | 'ERROR';

const SENSITIVE_PATTERNS = [
  /client_secret[=:]\s*["']?[^"'\s]+["']?/gi,
  /access_token[=:]\s*["']?[^"'\s]+["']?/gi,
  /refresh_token[=:]\s*["']?[^"'\s]+["']?/gi,
  /Bearer\s+[\w\-._~+/]+=*/gi,
  /"apiKey":\s*"[^"]+"/gi,
];

function sanitize(msg: string): string {
  let cleaned = msg;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

export const logger = {
  info(scope: LogScope, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${scope}] ${sanitize(message)}`, ...args);
  },

  warn(scope: LogScope, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${scope}] ⚠️ ${sanitize(message)}`, ...args);
  },

  error(scope: LogScope, message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const errMsg = error instanceof Error ? error.stack || error.message : String(error || '');
    console.error(`[${timestamp}] [${scope}] ❌ ${sanitize(message)}`, errMsg ? sanitize(errMsg) : '');
  },

  debug(scope: LogScope, message: string, ...args: any[]) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [${scope}] [DEBUG] ${sanitize(message)}`, ...args);
    }
  },
};
