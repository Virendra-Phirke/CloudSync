import test from 'node:test';
import assert from 'node:assert';
import { getProvider, listSupportedProviders } from '../lib/providers/index';
import { normalizeCloudPath, fetchWithProviderRetry, ProviderError } from '../lib/providers/base';

test('Provider Abstraction - registry provides all 3 cloud providers', () => {
  const google = getProvider('google');
  const dropbox = getProvider('dropbox');
  const onedrive = getProvider('onedrive');

  assert.strictEqual(google.id, 'google');
  assert.strictEqual(google.name, 'Google Drive');

  assert.strictEqual(dropbox.id, 'dropbox');
  assert.strictEqual(dropbox.name, 'Dropbox');

  assert.strictEqual(onedrive.id, 'onedrive');
  assert.strictEqual(onedrive.name, 'Microsoft OneDrive');

  // Verify listSupportedProviders returns all 3
  const list = listSupportedProviders();
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map((p) => p.id).sort(), ['dropbox', 'google', 'onedrive']);
});

test('Provider Abstraction - common interface methods are present on all providers', () => {
  const requiredMethods = [
    'isAuthenticated',
    'getUserInfo',
    'disconnect',
    'listFiles',
    'getMetadata',
    'uploadFile',
    'downloadFile',
    'downloadFileAsText',
    'createFolder',
    'deleteFile',
    'moveFile',
    'renameFile',
    'getChanges',
    'getQuota',
  ];

  for (const id of ['google', 'dropbox', 'onedrive'] as const) {
    const provider = getProvider(id);
    for (const method of requiredMethods) {
      assert.strictEqual(
        typeof (provider as any)[method],
        'function',
        `Provider [${id}] must implement ${method}`
      );
    }
  }
});

test('Base Provider - normalizeCloudPath handles various formats', () => {
  assert.strictEqual(normalizeCloudPath(''), '/');
  assert.strictEqual(normalizeCloudPath('/'), '/');
  assert.strictEqual(normalizeCloudPath('.'), '/');
  assert.strictEqual(normalizeCloudPath('foo'), '/foo');
  assert.strictEqual(normalizeCloudPath('/foo/bar/'), '/foo/bar');
  assert.strictEqual(normalizeCloudPath('foo\\bar\\baz'), '/foo/bar/baz');
  assert.strictEqual(normalizeCloudPath('///a//b/c///'), '/a/b/c');
});

test('Base Provider - fetchWithProviderRetry handles 429 rate limit with Retry-After', async () => {
  let attempts = 0;
  const originalFetch = global.fetch;

  global.fetch = async () => {
    attempts++;
    if (attempts === 1) {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const res = await fetchWithProviderRetry('test-provider', 'https://api.example.com/test', {}, {
      maxRetries: 2,
      initialBackoffMs: 10,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(attempts, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Base Provider - fetchWithProviderRetry retries on 503 and network failure', async () => {
  let attempts = 0;
  const originalFetch = global.fetch;

  global.fetch = async () => {
    attempts++;
    if (attempts === 1) {
      throw new Error('ECONNRESET');
    }
    if (attempts === 2) {
      return new Response('Service Unavailable', { status: 503 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const res = await fetchWithProviderRetry('test-provider', 'https://api.example.com/test', {}, {
      maxRetries: 3,
      initialBackoffMs: 10,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(attempts, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
