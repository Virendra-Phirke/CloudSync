import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY || '';
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET || process.env.DROPBOX_APP_SECRET || '';

const ONEDRIVE_CLIENT_ID =
  process.env.ONEDRIVE_CLIENT_ID ||
  process.env.AZURE_CLIENT_ID ||
  process.env.MICROSOFT_CLIENT_ID ||
  '';
const ONEDRIVE_CLIENT_SECRET =
  process.env.ONEDRIVE_CLIENT_SECRET ||
  process.env.AZURE_CLIENT_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET ||
  '';

// GET /api/auth/token — returns current auth state from cookies
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');

  if (provider === 'dropbox') {
    const accessToken = request.cookies.get('dbx_access_token')?.value;
    const userCookie = request.cookies.get('dbx_user')?.value;
    if (!accessToken || !userCookie) {
      return NextResponse.json({ authenticated: false, provider: 'dropbox' });
    }
    try {
      return NextResponse.json({ authenticated: true, user: JSON.parse(userCookie), accessToken, provider: 'dropbox' });
    } catch {
      return NextResponse.json({ authenticated: false, provider: 'dropbox' });
    }
  }

  if (provider === 'onedrive') {
    const accessToken = request.cookies.get('one_access_token')?.value;
    const userCookie = request.cookies.get('one_user')?.value;
    if (!accessToken || !userCookie) {
      return NextResponse.json({ authenticated: false, provider: 'onedrive' });
    }
    try {
      return NextResponse.json({ authenticated: true, user: JSON.parse(userCookie), accessToken, provider: 'onedrive' });
    } catch {
      return NextResponse.json({ authenticated: false, provider: 'onedrive' });
    }
  }

  // Default: Google Drive
  const accessToken = request.cookies.get('g_access_token')?.value;
  const userCookie = request.cookies.get('g_user')?.value;

  if (!accessToken || !userCookie) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  try {
    const user = JSON.parse(userCookie);
    return NextResponse.json({ authenticated: true, user, accessToken });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
}

// POST /api/auth/token — refreshes the access token using the stored refresh token
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') || 'google';

  const isProd = process.env.NODE_ENV === 'production';

  // 1. Dropbox Refresh
  if (provider === 'dropbox') {
    const refreshToken = request.cookies.get('dbx_refresh_token')?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: 'No Dropbox refresh token' }, { status: 401 });
    }

    try {
      const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${DROPBOX_CLIENT_ID}:${DROPBOX_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        console.error('Dropbox token refresh error:', err);
        return NextResponse.json({ error: 'Dropbox token refresh failed' }, { status: 401 });
      }

      const tokens = await tokenRes.json();
      const response = NextResponse.json({ accessToken: tokens.access_token });
      response.cookies.set('dbx_access_token', tokens.access_token, {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        maxAge: tokens.expires_in || 14400,
        path: '/',
      });
      return response;
    } catch (err) {
      console.error('Dropbox refresh error:', err);
      return NextResponse.json({ error: 'Network error' }, { status: 500 });
    }
  }

  // 2. OneDrive Refresh
  if (provider === 'onedrive') {
    const refreshToken = request.cookies.get('one_refresh_token')?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: 'No OneDrive refresh token' }, { status: 401 });
    }

    try {
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: ONEDRIVE_CLIENT_ID,
          client_secret: ONEDRIVE_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        console.error('OneDrive token refresh error:', err);
        return NextResponse.json({ error: 'OneDrive token refresh failed' }, { status: 401 });
      }

      const tokens = await tokenRes.json();
      const response = NextResponse.json({ accessToken: tokens.access_token });
      response.cookies.set('one_access_token', tokens.access_token, {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        maxAge: tokens.expires_in || 3600,
        path: '/',
      });
      return response;
    } catch (err) {
      console.error('OneDrive refresh error:', err);
      return NextResponse.json({ error: 'Network error' }, { status: 500 });
    }
  }

  // 3. Google Refresh (default)
  const refreshToken = request.cookies.get('g_refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('Token refresh error:', err);
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const tokens = await tokenRes.json();
    const response = NextResponse.json({ accessToken: tokens.access_token });
    response.cookies.set('g_access_token', tokens.access_token, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: tokens.expires_in || 3600,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Token refresh fetch error:', err);
    return NextResponse.json({ error: 'Network error' }, { status: 500 });
  }
}
