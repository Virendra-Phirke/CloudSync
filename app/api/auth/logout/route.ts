import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  // Clear all Google OAuth cookies
  const cookieOptions = { path: '/', maxAge: 0 };
  response.cookies.set('g_access_token', '', cookieOptions);
  response.cookies.set('g_refresh_token', '', cookieOptions);
  response.cookies.set('g_user', '', cookieOptions);
  response.cookies.set('g_oauth_state', '', cookieOptions);

  return response;
}
