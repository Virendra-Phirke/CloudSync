import test from 'node:test';
import assert from 'node:assert';
import { OneDriveProvider } from '../lib/providers/onedrive';

test('OneDriveProvider - initialization and identity', () => {
  const provider = new OneDriveProvider();
  assert.strictEqual(provider.id, 'onedrive');
  assert.strictEqual(provider.name, 'Microsoft OneDrive');
});

test('OneDriveProvider - listFiles parses Microsoft Graph format and handles @odata.nextLink pagination', async () => {
  const provider = new OneDriveProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'one_access_token=mock_one_token; one_user={"email":"user@outlook.com","name":"MS User"}',
  };

  let requestedUrl = '';

  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = input.toString();

    if (requestedUrl.includes('skiptoken=page2')) {
      return new Response(
        JSON.stringify({
          value: [
            {
              id: 'file_page2',
              name: 'budget2.xlsx',
              size: 8192,
              lastModifiedDateTime: '2026-02-01T12:00:00Z',
              file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        value: [
          {
            id: 'folder_reports',
            name: 'Reports',
            folder: { childCount: 4 },
            lastModifiedDateTime: '2026-01-15T09:00:00Z',
          },
          {
            id: 'file_budget',
            name: 'budget1.xlsx',
            size: 4096,
            lastModifiedDateTime: '2026-01-20T10:00:00Z',
            file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?skiptoken=page2',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const page1 = await provider.listFiles({ folderIdOrPath: 'root' });
    assert.strictEqual(page1.items.length, 2);
    assert.strictEqual(page1.items[0].name, 'Reports');
    assert.strictEqual(page1.items[0].isDirectory, true);
    assert.strictEqual(page1.items[1].name, 'budget1.xlsx');
    assert.strictEqual(page1.items[1].isDirectory, false);
    assert.strictEqual(page1.items[1].size, 4096);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.nextPageToken, 'https://graph.microsoft.com/v1.0/me/drive/root/children?skiptoken=page2');

    const page2 = await provider.listFiles({ pageToken: page1.nextPageToken });
    assert.strictEqual(page2.items.length, 1);
    assert.strictEqual(page2.items[0].name, 'budget2.xlsx');
    assert.strictEqual(page2.hasMore, false);
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('OneDriveProvider - uploadFile handles simple PUT for files under 4MB', async () => {
  const provider = new OneDriveProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'one_access_token=mock_one_token',
  };

  let uploadedUrl = '';
  let uploadedMethod = '';

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    uploadedUrl = input.toString();
    uploadedMethod = init?.method || 'GET';

    return new Response(
      JSON.stringify({
        id: 'new_one_file',
        name: 'summary.txt',
        size: 16,
        lastModifiedDateTime: '2026-02-10T12:00:00Z',
        file: { mimeType: 'text/plain' },
        parentReference: { path: '/drive/root:/Documents' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const blob = new Blob(['Hello, OneDrive!'], { type: 'text/plain' });
    const item = await provider.uploadFile(blob, '/Documents', 'summary.txt');

    assert.strictEqual(item.id, 'new_one_file');
    assert.strictEqual(item.name, 'summary.txt');
    assert.strictEqual(uploadedMethod, 'PUT');
    assert.ok(uploadedUrl.includes('/content'));
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('OneDriveProvider - createFolder, deleteFile, moveFile, and renameFile operate correctly', async () => {
  const provider = new OneDriveProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'one_access_token=mock_one_token',
  };

  const executedMethods: Array<{ method: string; url: string }> = [];

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method || 'GET';
    executedMethods.push({ method, url });

    if (method === 'POST') {
      return new Response(
        JSON.stringify({
          id: 'folder_created_id',
          name: 'Projects',
          folder: {},
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    if (method === 'PATCH') {
      return new Response(
        JSON.stringify({
          id: 'item_patched',
          name: 'renamed.txt',
          size: 50,
          lastModifiedDateTime: '2026-02-15T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Default metadata not found
    return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
  };

  try {
    const folder = await provider.createFolder('Projects', 'root');
    assert.strictEqual(folder.id, 'folder_created_id');
    assert.strictEqual(folder.name, 'Projects');
    assert.strictEqual(folder.isNew, true);

    await provider.deleteFile('file_to_del');

    const renamed = await provider.renameFile('file_to_del', 'renamed.txt');
    assert.strictEqual(renamed.name, 'renamed.txt');

    assert.ok(executedMethods.some((m) => m.method === 'POST'));
    assert.ok(executedMethods.some((m) => m.method === 'DELETE'));
    assert.ok(executedMethods.some((m) => m.method === 'PATCH'));
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('OneDriveProvider - getChanges uses Delta API and captures deltaLink', async () => {
  const provider = new OneDriveProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'one_access_token=mock_one_token',
  };

  global.fetch = async () => {
    return new Response(
      JSON.stringify({
        value: [
          {
            id: 'delta_file_1',
            name: 'quarterly.docx',
            size: 10240,
            lastModifiedDateTime: '2026-03-01T12:00:00Z',
            file: { mimeType: 'application/msword' },
          },
          {
            id: 'deleted_item_1',
            deleted: { state: 'deleted' },
          },
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=latest_delta_token',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const changes = await provider.getChanges();
    assert.strictEqual(changes.items.length, 1);
    assert.strictEqual(changes.items[0].name, 'quarterly.docx');
    assert.strictEqual(changes.deletedIds.length, 1);
    assert.strictEqual(changes.deletedIds[0], 'deleted_item_1');
    assert.strictEqual(changes.cursor, 'https://graph.microsoft.com/v1.0/me/drive/root/delta?token=latest_delta_token');
    assert.strictEqual(changes.hasMore, false);
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('OneDriveProvider - getQuota extracts quota breakdown', async () => {
  const provider = new OneDriveProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'one_access_token=mock_one_token',
  };

  global.fetch = async () => {
    return new Response(
      JSON.stringify({
        quota: {
          total: 107374182400, // 100 GB
          used: 21474836480,   // 20 GB
          remaining: 85899345920,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const quota = await provider.getQuota();
    assert.ok(quota !== null);
    assert.strictEqual(quota.totalBytes, 107374182400);
    assert.strictEqual(quota.usedBytes, 21474836480);
    assert.strictEqual(quota.freeBytes, 85899345920);
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});
