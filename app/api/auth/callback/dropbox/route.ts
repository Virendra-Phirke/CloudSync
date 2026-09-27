import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY || '';
const CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET || process.env.DROPBOX_APP_SECRET || '';
const REDIRECT_URI =
  process.env.DROPBOX_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/dropbox`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error_description') || searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?auth_error=' + encodeURIComponent(error), request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?auth_error=missing_params', request.url));
  }

  // Validate CSRF state
  const storedState = request.cookies.get('dbx_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/?auth_error=state_mismatch', request.url));
  }

  let tokens: { access_token: string; refresh_token?: string; expires_in?: number; account_id?: string };

  try {
    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('Dropbox token exchange error:', err);
      return NextResponse.redirect(new URL('/?auth_error=token_exchange_failed', request.url));
    }

    tokens = await tokenRes.json();
  } catch (err) {
    console.error('Dropbox token exchange network error:', err);
    return NextResponse.redirect(new URL('/?auth_error=network_error', request.url));
  }

  // Fetch Dropbox user info
  let userInfo: { id: string; email: string; name: string; picture?: string; provider: string };
  try {
    const userRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userRes.ok) throw new Error('Failed to fetch Dropbox user');
    const data = await userRes.json();
    userInfo = {
      id: data.account_id,
      email: data.email,
      name: data.name?.display_name || data.email,
      picture: data.profile_photo_url,
      provider: 'dropbox',
    };
  } catch (err) {
    console.error('Dropbox user fetch error:', err);
    return NextResponse.redirect(new URL('/?auth_error=userinfo_failed', request.url));
  }

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.redirect(new URL('/?auth_success=1&provider=dropbox', request.url));

  // Clear CSRF state
  response.cookies.delete('dbx_oauth_state');

  // Store access token
  response.cookies.set('dbx_access_token', tokens.access_token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: tokens.expires_in || 14400, // Dropbox tokens typically 4h
    path: '/',
  });

  // Store refresh token (httpOnly)
  if (tokens.refresh_token) {
    response.cookies.set('dbx_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/',
    });
  }

  // Store user info
  response.cookies.set('dbx_user', JSON.stringify(userInfo), {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  });

  return response;
}
