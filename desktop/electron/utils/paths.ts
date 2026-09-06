import path from 'path';
import { app } from 'electron';

export function getAppUserDataPath(): string {
  return app ? app.getPath('userData') : path.join(process.cwd(), '.desktop-data');
}

export function getIconPath(): string {
  const fs = require('fs');
  const prodIcon = path.join(__dirname, '../assets/icon.ico');
  const devIcon = path.join(__dirname, '../../../public/favicon.ico');
  if (fs.existsSync(prodIcon)) return prodIcon;
  if (fs.existsSync(devIcon)) return devIcon;
  return prodIcon;
}

export function getNextAppUrl(): string {
  return process.env.DESKTOP_DEV_URL || 'http://localhost:3000';
}
