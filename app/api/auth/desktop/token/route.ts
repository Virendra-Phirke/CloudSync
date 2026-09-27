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

// In-memory rate limiter: max 10 token refreshes per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// Max session age: 30 days — sessions older than this must re-authenticate
const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// POST /api/auth/desktop/token — Refreshes Google access token using server-held refresh token
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!sessionToken) {
      return NextResponse.json({ error: 'Missing session token' }, { status: 401 });
    }

    const session = decryptPayload<SessionPayload>(sessionToken);
    if (!session || !session.googleRefreshToken || !session.userId) {
      return NextResponse.json({ error: 'Invalid or expired CloudSync session' }, { status: 401 });
    }

    // Reject sessions older than 30 days
    if (session.createdAt && Date.now() - session.createdAt > MAX_SESSION_AGE_MS) {
      return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 });
    }

    // Refresh the Google access token server-side — GOOGLE_CLIENT_SECRET never leaves the server
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
      const err = await tokenRes.json().catch(() => ({}));
      // Log full error server-side but never expose OAuth error details to the client
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
