import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

// GET /api/auth/token — returns current auth state from cookies
export async function GET(request: NextRequest) {
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
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      console.error('Token refresh error:', err);
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const tokens = await tokenRes.json();
    const isProd = process.env.NODE_ENV === 'production';

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
