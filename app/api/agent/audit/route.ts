import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/agent/auditLogger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const logs = getAuditLogs(Math.min(limit, 200));
  return NextResponse.json({ logs });
}
