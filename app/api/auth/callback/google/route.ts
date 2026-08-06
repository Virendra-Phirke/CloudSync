import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle user denial
  if (error) {
    return NextResponse.redirect(new URL('/?auth_error=' + encodeURIComponent(error), request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?auth_error=missing_params', request.url));
  }

  // CSRF validation
  const storedState = request.cookies.get('g_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/?auth_error=state_mismatch', request.url));
  }

  // Exchange authorization code for tokens
  let tokens: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      console.error('Token exchange error:', err);
      return NextResponse.redirect(new URL('/?auth_error=token_exchange_failed', request.url));
    }

    tokens = await tokenRes.json();
  } catch (err) {
    console.error('Token exchange fetch error:', err);
    return NextResponse.redirect(new URL('/?auth_error=network_error', request.url));
  }

  // Fetch user info
  let userInfo: { email: string; name: string; picture: string };
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new Error('Failed to fetch user info');
    userInfo = await userRes.json();
  } catch (err) {
    console.error('User info fetch error:', err);
    return NextResponse.redirect(new URL('/?auth_error=userinfo_failed', request.url));
  }

  const isProd = process.env.NODE_ENV === 'production';
  const accessTokenMaxAge = tokens.expires_in || 3600; // ~1 hour

  const response = NextResponse.redirect(new URL('/?auth_success=1', request.url));

  // Clear the CSRF state cookie
  response.cookies.delete('g_oauth_state');

  // Store access token — js-readable so client can use it for Drive API calls
  response.cookies.set('g_access_token', tokens.access_token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: accessTokenMaxAge,
    path: '/',
  });

  // Store refresh token — httpOnly for security
  if (tokens.refresh_token) {
    response.cookies.set('g_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
  }

  // Store user info — js-readable for displaying in UI
  response.cookies.set('g_user', JSON.stringify(userInfo), {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
