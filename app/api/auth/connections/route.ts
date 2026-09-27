import { NextRequest, NextResponse } from 'next/server';

export interface CloudConnectionInfo {
  provider: 'google' | 'dropbox' | 'onedrive';
  name: string;
  connected: boolean;
  user?: {
    email: string;
    name: string;
    picture?: string;
  };
}

export async function GET(request: NextRequest) {
  const connections: CloudConnectionInfo[] = [];

  // 1. Google Drive
  const gUserCookie = request.cookies.get('g_user')?.value;
  const gAccessToken = request.cookies.get('g_access_token')?.value;
  const gRefreshToken = request.cookies.get('g_refresh_token')?.value;
  const gConnected = Boolean((gAccessToken || gRefreshToken) && gUserCookie);
  let gUser;
  if (gConnected && gUserCookie) {
    try {
      gUser = JSON.parse(gUserCookie);
    } catch {}
  }
  connections.push({
    provider: 'google',
    name: 'Google Drive',
    connected: gConnected,
    user: gUser,
  });

  // 2. Dropbox
  const dbxUserCookie = request.cookies.get('dbx_user')?.value;
  const dbxAccessToken = request.cookies.get('dbx_access_token')?.value;
  const dbxRefreshToken = request.cookies.get('dbx_refresh_token')?.value;
  const dbxConnected = Boolean((dbxAccessToken || dbxRefreshToken) && dbxUserCookie);
  let dbxUser;
  if (dbxConnected && dbxUserCookie) {
    try {
      dbxUser = JSON.parse(dbxUserCookie);
    } catch {}
  }
  connections.push({
    provider: 'dropbox',
    name: 'Dropbox',
    connected: dbxConnected,
    user: dbxUser,
  });

  // 3. OneDrive
  const oneUserCookie = request.cookies.get('one_user')?.value;
  const oneAccessToken = request.cookies.get('one_access_token')?.value;
  const oneRefreshToken = request.cookies.get('one_refresh_token')?.value;
  const oneConnected = Boolean((oneAccessToken || oneRefreshToken) && oneUserCookie);
  let oneUser;
  if (oneConnected && oneUserCookie) {
    try {
      oneUser = JSON.parse(oneUserCookie);
    } catch {}
  }
  connections.push({
    provider: 'onedrive',
    name: 'Microsoft OneDrive',
    connected: oneConnected,
    user: oneUser,
  });

  return NextResponse.json({ connections });
}
