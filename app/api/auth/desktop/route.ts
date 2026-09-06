import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// GET /api/auth/desktop — Initiates PKCE-protected Google OAuth flow for desktop
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  const state = searchParams.get('state');

  if (!challenge || !state) {
    return NextResponse.json({ error: 'Missing challenge or state parameter' }, { status: 400 });
  }

  // Encode desktop transaction parameters in the state parameter
  // Format: desk.<base64url(JSON({ state, challenge }))>
  const desktopPayload = JSON.stringify({ state, challenge, createdAt: Date.now() });
  const encodedState = `desk.${Buffer.from(desktopPayload).toString('base64url')}`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: encodedState,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
