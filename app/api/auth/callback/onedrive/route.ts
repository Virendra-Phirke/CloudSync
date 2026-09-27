import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID =
  process.env.ONEDRIVE_CLIENT_ID ||
  process.env.AZURE_CLIENT_ID ||
  process.env.MICROSOFT_CLIENT_ID ||
  '';
const CLIENT_SECRET =
  process.env.ONEDRIVE_CLIENT_SECRET ||
  process.env.AZURE_CLIENT_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET ||
  '';
const REDIRECT_URI =
  process.env.ONEDRIVE_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/onedrive`;

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
  const storedState = request.cookies.get('one_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/?auth_error=state_mismatch', request.url));
  }

  let tokens: { access_token: string; refresh_token?: string; expires_in?: number };

  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('OneDrive token exchange error:', err);
      return NextResponse.redirect(new URL('/?auth_error=token_exchange_failed', request.url));
    }

    tokens = await tokenRes.json();
  } catch (err) {
    console.error('OneDrive token exchange network error:', err);
    return NextResponse.redirect(new URL('/?auth_error=network_error', request.url));
  }

  // Fetch Microsoft Graph user info
  let userInfo: { id: string; email: string; name: string; provider: string };
  try {
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) throw new Error('Failed to fetch OneDrive user');
    const data = await userRes.json();
    userInfo = {
      id: data.id,
      email: data.mail || data.userPrincipalName,
      name: data.displayName || data.mail || 'OneDrive User',
      provider: 'onedrive',
    };
  } catch (err) {
    console.error('OneDrive user fetch error:', err);
    return NextResponse.redirect(new URL('/?auth_error=userinfo_failed', request.url));
  }

  const isProd = process.env.NODE_ENV === 'production';
  const response = NextResponse.redirect(new URL('/?auth_success=1&provider=onedrive', request.url));

  // Clear CSRF state
  response.cookies.delete('one_oauth_state');

  // Store access token
  response.cookies.set('one_access_token', tokens.access_token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: tokens.expires_in || 3600, // Microsoft Graph tokens typically 1h
    path: '/',
  });

  // Store refresh token (httpOnly)
  if (tokens.refresh_token) {
    response.cookies.set('one_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/',
    });
  }

  // Store user info
  response.cookies.set('one_user', JSON.stringify(userInfo), {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  });

  return response;
}
