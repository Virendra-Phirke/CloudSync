import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/agent/auditLogger';

// Guard: only accessible in development or with a server-only admin token.
// This endpoint exposes internal operation audit logs and must never be public.
const ADMIN_TOKEN = process.env.AUDIT_ADMIN_TOKEN;

export async function GET(request: NextRequest) {
  // Block in production unless explicit admin token is set and matched
  if (process.env.NODE_ENV === 'production') {
    if (!ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Audit log access is disabled in production' }, { status: 403 });
    }
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const logs = getAuditLogs(Math.min(limit, 200));
  return NextResponse.json({ logs });
}
