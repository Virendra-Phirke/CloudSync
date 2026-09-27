import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CLIENT_ID = process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY || '';
const REDIRECT_URI =
  process.env.DROPBOX_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/dropbox`;

const SCOPES = [
  'account_info.read',
  'files.metadata.read',
  'files.metadata.write',
  'files.content.read',
  'files.content.write',
].join(' ');

export async function GET(request: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.redirect(
      new URL('/?auth_error=' + encodeURIComponent('Dropbox credentials not configured in environment'), request.url)
    );
  }

  // Generate random CSRF state token
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    token_access_type: 'offline',
    scope: SCOPES,
    state,
  });

  const authUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  const response = NextResponse.redirect(authUrl);

  // Store state in httpOnly cookie
  response.cookies.set('dbx_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
