import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Stateless session invalidation; client removes session from safeStorage
  return NextResponse.json({ success: true });
}
