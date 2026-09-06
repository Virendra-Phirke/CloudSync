import { NextRequest, NextResponse } from 'next/server';
import { decryptPayload, encryptPayload, calculatePkceChallenge } from '@/lib/serverCrypto';

interface TempCodePayload {
  challenge: string;
  googleRefreshToken: string;
  user: { email: string; name: string; picture: string };
  initialAccessToken: string;
  expiresAt: number;
}

// POST /api/auth/desktop/exchange — Exchanges PKCE verifier + temp code for a CloudSync Session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, verifier } = body;

    if (!code || !verifier) {
      return NextResponse.json({ error: 'Missing code or verifier' }, { status: 400 });
    }

    const payload = decryptPayload<TempCodePayload>(code);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or tampered authorization code' }, { status: 401 });
    }

    if (Date.now() > payload.expiresAt) {
      return NextResponse.json({ error: 'Authorization code has expired' }, { status: 401 });
    }

    // Verify PKCE code challenge
    const calculatedChallenge = calculatePkceChallenge(verifier);
    if (calculatedChallenge !== payload.challenge) {
      return NextResponse.json({ error: 'PKCE challenge verification failed' }, { status: 401 });
    }

    // Issue CloudSync Session Token (Google refresh token stays encrypted server-side)
    const sessionToken = encryptPayload({
      userId: payload.user.email,
      googleRefreshToken: payload.googleRefreshToken,
      user: payload.user,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      sessionToken,
      user: payload.user,
      accessToken: payload.initialAccessToken,
    });
  } catch (err) {
    console.error('Desktop auth exchange error:', err);
    return NextResponse.json({ error: 'Exchange internal error' }, { status: 500 });
  }
}
