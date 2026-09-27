import path from 'path';
import { app } from 'electron';

export function getAppUserDataPath(): string {
  return app ? app.getPath('userData') : path.join(process.cwd(), '.desktop-data');
}

export function getIconPath(): string {
  const fs = require('fs');
  const candidates = [
    path.resolve(__dirname, '../../assets/icon.ico'),
    path.resolve(__dirname, '../assets/icon.ico'),
    path.resolve(process.cwd(), 'desktop/electron/assets/icon.ico'),
    path.resolve(__dirname, '../../../../public/favicon.ico'),
    path.resolve(process.cwd(), 'public/favicon.ico'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, '../../assets/icon.ico');
}

export function getNextAppUrl(): string {
  return process.env.DESKTOP_DEV_URL || 'http://localhost:3000';
}
