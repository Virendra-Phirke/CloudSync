import { NextRequest, NextResponse } from 'next/server';
import { runAgentConversation } from '@/lib/agent/agentService';
import { ToolSecurityContext } from '@/lib/agent/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], confirmationToken, isConfirmed } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Resolve user from cookies
    let userEmail = 'user@omnisync.local';
    let userId = 'user_default';

    const gUserCookie = request.cookies.get('g_user')?.value;
    const dbxUserCookie = request.cookies.get('dbx_user')?.value;
    const oneUserCookie = request.cookies.get('one_user')?.value;

    if (gUserCookie) {
      try {
        const u = JSON.parse(gUserCookie);
        userEmail = u.email || userEmail;
        userId = u.id || u.email || userId;
      } catch {}
    } else if (dbxUserCookie) {
      try {
        const u = JSON.parse(dbxUserCookie);
        userEmail = u.email || userEmail;
        userId = u.id || u.email || userId;
      } catch {}
    } else if (oneUserCookie) {
      try {
        const u = JSON.parse(oneUserCookie);
        userEmail = u.email || userEmail;
        userId = u.id || u.email || userId;
      } catch {}
    }

    const sessionId = request.cookies.get('omnisync_session')?.value || `sess_${Date.now()}`;

    const context: ToolSecurityContext = {
      userId,
      userEmail,
      sessionId,
      confirmationToken,
      isConfirmed: Boolean(isConfirmed),
    };

    const response = await runAgentConversation(message, history, context);
    return NextResponse.json(response);
  } catch (err: any) {
    console.error('Agent chat error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal AI Agent error' },
      { status: 500 }
    );
  }
}
