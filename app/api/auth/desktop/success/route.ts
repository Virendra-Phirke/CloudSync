import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const title = error ? 'Authentication Failed' : 'Authentication Successful';
  const subtitle = error
    ? `Error: ${error}. You may close this window and try again.`
    : 'You have successfully signed in with Google Drive. You can now return to the CloudSync desktop application.';
  const iconSvg = error
    ? '<svg width="56" height="56" fill="none" stroke="#ef4444" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg width="56" height="56" fill="none" stroke="#10b981" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - CloudSync</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.15);
      border-radius: 16px;
      padding: 40px;
      max-width: 440px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .icon { margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff; }
    p { font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px 0; }
    .footer { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconSvg}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <div class="footer">CloudSync Secure Desktop Authentication</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
