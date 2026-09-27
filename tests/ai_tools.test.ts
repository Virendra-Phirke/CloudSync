import test from 'node:test';
import assert from 'node:assert';
import {
  toolGetCloudConnections,
  toolListCloudFiles,
  toolUploadFile,
  toolDeleteCloudFile,
  toolDownloadFile,
  toolCreateSyncJob,
} from '../lib/agent/tools';
import {
  ToolSecurityContext,
  TaskExecutionMetrics,
  DestructiveConfirmationRequest,
} from '../lib/agent/types';
import { createDestructiveConfirmation } from '../lib/agent/securityPolicy';

// Set dummy session secret for crypto
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';

function makeContext(overrides: Partial<ToolSecurityContext> = {}): ToolSecurityContext {
  return {
    userId: 'user_456',
    userEmail: 'alice@cloudsync.com',
    sessionId: 'session_789',
    ...overrides,
  };
}

function makeMetrics(): TaskExecutionMetrics {
  return {
    toolCallsCount: 0,
    filesAffectedCount: 0,
    bytesTransferred: 0,
    startTime: Date.now(),
    activeOperations: 1,
  };
}

test('AI Tools - toolGetCloudConnections lists providers without exposing secrets', async () => {
  const context = makeContext();
  const metrics = makeMetrics();

  const res = await toolGetCloudConnections(context, metrics);
  assert.strictEqual(res.connections.length, 3);
  assert.deepStrictEqual(res.connections.map((c) => c.provider).sort(), ['dropbox', 'google', 'onedrive']);

  // Ensure no token or secret fields exist
  for (const c of res.connections) {
    assert.strictEqual((c as any).accessToken, undefined);
    assert.strictEqual((c as any).refreshToken, undefined);
    assert.strictEqual((c as any).clientSecret, undefined);
  }
});

test('AI Tools - toolDeleteCloudFile blocks unconfirmed deletion and requires confirmation token', async () => {
  const context = makeContext({ isConfirmed: false, confirmationToken: undefined });
  const metrics = makeMetrics();

  const res = await toolDeleteCloudFile(
    { provider: 'google', filePath: '/docs/presentation.pdf' },
    context,
    metrics
  );

  // Expect destructive confirmation request
  assert.strictEqual((res as DestructiveConfirmationRequest).requiresConfirmation, true);
  assert.strictEqual((res as DestructiveConfirmationRequest).action, 'delete');
  assert.ok((res as DestructiveConfirmationRequest).confirmationToken);
  assert.ok((res as DestructiveConfirmationRequest).description.includes('presentation.pdf'));
});

test('AI Tools - toolDeleteCloudFile executes when valid confirmation token is provided', async () => {
  const userId = 'user_456';
  const confirmation = createDestructiveConfirmation(
    'delete',
    'Delete presentation.pdf',
    [{ path: '/docs/presentation.pdf' }],
    userId
  );

  const context = makeContext({
    userId,
    confirmationToken: confirmation.confirmationToken,
  });
  const metrics = makeMetrics();

  // Mock provider fetch to simulate deletion
  const originalFetch = global.fetch;
  (global as any).document = { cookie: 'g_access_token=mock_google_token' };

  global.fetch = async () => new Response(null, { status: 204 });

  try {
    const res = await toolDeleteCloudFile(
      { provider: 'google', filePath: '/docs/presentation.pdf' },
      context,
      metrics
    );

    assert.strictEqual((res as any).success, true);
    assert.strictEqual((res as any).deletedPath, '/docs/presentation.pdf');
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('AI Tools - toolCreateSyncJob flags large-scale whole-drive sync for confirmation', async () => {
  const context = makeContext({ isConfirmed: false });
  const metrics = makeMetrics();

  const res = await toolCreateSyncJob(
    {
      sourceProvider: 'google',
      sourcePath: '/',
      destinationProvider: 'dropbox',
      destinationPath: '/',
    },
    context,
    metrics
  );

  assert.strictEqual((res as DestructiveConfirmationRequest).requiresConfirmation, true);
  assert.strictEqual((res as DestructiveConfirmationRequest).action, 'large_scale_sync');
});
