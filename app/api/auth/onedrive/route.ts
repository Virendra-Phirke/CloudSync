import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CLIENT_ID =
  process.env.ONEDRIVE_CLIENT_ID ||
  process.env.AZURE_CLIENT_ID ||
  process.env.MICROSOFT_CLIENT_ID ||
  '';
const REDIRECT_URI =
  process.env.ONEDRIVE_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/onedrive`;

const SCOPES = [
  'offline_access',
  'Files.ReadWrite',
  'User.Read',
].join(' ');

export async function GET(request: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.redirect(
      new URL('/?auth_error=' + encodeURIComponent('OneDrive credentials not configured in environment'), request.url)
    );
  }

  // Generate random CSRF state token
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state,
  });

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  const response = NextResponse.redirect(authUrl);

  // Store state in httpOnly cookie
  response.cookies.set('one_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
