import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');

  const response = NextResponse.json({ success: true, provider: provider || 'all' });
  const cookieOptions = { path: '/', maxAge: 0 };

  if (provider === 'dropbox') {
    response.cookies.set('dbx_access_token', '', cookieOptions);
    response.cookies.set('dbx_refresh_token', '', cookieOptions);
    response.cookies.set('dbx_user', '', cookieOptions);
    response.cookies.set('dbx_oauth_state', '', cookieOptions);
    return response;
  }

  if (provider === 'onedrive') {
    response.cookies.set('one_access_token', '', cookieOptions);
    response.cookies.set('one_refresh_token', '', cookieOptions);
    response.cookies.set('one_user', '', cookieOptions);
    response.cookies.set('one_oauth_state', '', cookieOptions);
    return response;
  }

  if (provider === 'google') {
    response.cookies.set('g_access_token', '', cookieOptions);
    response.cookies.set('g_refresh_token', '', cookieOptions);
    response.cookies.set('g_user', '', cookieOptions);
    response.cookies.set('g_oauth_state', '', cookieOptions);
    return response;
  }

  // Clear all
  response.cookies.set('g_access_token', '', cookieOptions);
  response.cookies.set('g_refresh_token', '', cookieOptions);
  response.cookies.set('g_user', '', cookieOptions);
  response.cookies.set('g_oauth_state', '', cookieOptions);

  response.cookies.set('dbx_access_token', '', cookieOptions);
  response.cookies.set('dbx_refresh_token', '', cookieOptions);
  response.cookies.set('dbx_user', '', cookieOptions);
  response.cookies.set('dbx_oauth_state', '', cookieOptions);

  response.cookies.set('one_access_token', '', cookieOptions);
  response.cookies.set('one_refresh_token', '', cookieOptions);
  response.cookies.set('one_user', '', cookieOptions);
  response.cookies.set('one_oauth_state', '', cookieOptions);

  return response;
}
