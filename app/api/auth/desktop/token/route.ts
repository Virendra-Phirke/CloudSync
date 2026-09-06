import { NextRequest, NextResponse } from 'next/server';
import { decryptPayload } from '@/lib/serverCrypto';

interface SessionPayload {
  userId: string;
  googleRefreshToken: string;
  user: { email: string; name: string; picture: string };
  createdAt: number;
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

// POST /api/auth/desktop/token — Refreshes Google access token using server-held refresh token
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!sessionToken) {
      return NextResponse.json({ error: 'Missing session token' }, { status: 401 });
    }

    const session = decryptPayload<SessionPayload>(sessionToken);
    if (!session || !session.googleRefreshToken) {
      return NextResponse.json({ error: 'Invalid or expired CloudSync session' }, { status: 401 });
    }

    // Refresh the Google access token server-side using GOOGLE_CLIENT_SECRET
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: session.googleRefreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      console.error('Server-side token refresh failed:', err);
      return NextResponse.json({ error: 'Failed to refresh Google token' }, { status: 401 });
    }

    const tokens = await tokenRes.json();
    return NextResponse.json({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in || 3600,
    });
  } catch (err) {
    console.error('Desktop token refresh route error:', err);
    return NextResponse.json({ error: 'Token refresh internal error' }, { status: 500 });
  }
}
