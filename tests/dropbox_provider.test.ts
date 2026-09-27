import test from 'node:test';
import assert from 'node:assert';
import { DropboxProvider } from '../lib/providers/dropbox.ts';

test('DropboxProvider - initialization and identity', () => {
  const provider = new DropboxProvider();
  assert.strictEqual(provider.id, 'dropbox');
  assert.strictEqual(provider.name, 'Dropbox');
});

test('DropboxProvider - listFiles parses Dropbox API v2 format and handles cursor pagination', async () => {
  const provider = new DropboxProvider();
  const originalFetch = global.fetch;

  let requestUrl = '';
  let requestBody: any = null;

  // Mock token retrieval via cookie
  (global as any).document = {
    cookie: 'dbx_access_token=mock_dbx_token; dbx_user={"email":"test@dropbox.com","name":"Test User"}',
  };

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = input.toString();
    requestBody = init?.body ? JSON.parse(init.body as string) : null;

    if (requestUrl.includes('/files/list_folder/continue')) {
      return new Response(
        JSON.stringify({
          entries: [
            {
              '.tag': 'file',
              id: 'id:page2_file',
              name: 'document2.pdf',
              path_display: '/docs/document2.pdf',
              size: 5000,
              server_modified: '2026-01-02T12:00:00Z',
              content_hash: 'hash_page2',
            },
          ],
          cursor: 'cursor_end',
          has_more: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        entries: [
          {
            '.tag': 'folder',
            id: 'id:folder1',
            name: 'docs',
            path_display: '/docs',
          },
          {
            '.tag': 'file',
            id: 'id:file1',
            name: 'document1.pdf',
            path_display: '/docs/document1.pdf',
            size: 2048,
            server_modified: '2026-01-01T10:00:00Z',
            content_hash: 'hash_file1',
          },
        ],
        cursor: 'cursor_page_1',
        has_more: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    // 1. First page
    const page1 = await provider.listFiles({ folderIdOrPath: '/docs' });
    assert.strictEqual(page1.items.length, 2);
    assert.strictEqual(page1.items[0].isDirectory, true);
    assert.strictEqual(page1.items[0].name, 'docs');
    assert.strictEqual(page1.items[1].isDirectory, false);
    assert.strictEqual(page1.items[1].name, 'document1.pdf');
    assert.strictEqual(page1.items[1].size, 2048);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.nextPageToken, 'cursor_page_1');

    // 2. Second page (continue pagination)
    const page2 = await provider.listFiles({ pageToken: page1.nextPageToken });
    assert.strictEqual(page2.items.length, 1);
    assert.strictEqual(page2.items[0].name, 'document2.pdf');
    assert.strictEqual(page2.hasMore, false);
    assert.strictEqual(requestUrl, 'https://api.dropboxapi.com/2/files/list_folder/continue');
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('DropboxProvider - uploadFile handles small upload with Dropbox-API-Arg', async () => {
  const provider = new DropboxProvider();
  const originalFetch = global.fetch;

  let requestHeaders: Record<string, string> = {};

  (global as any).document = {
    cookie: 'dbx_access_token=mock_dbx_token',
  };

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestHeaders = init?.headers as any;
    return new Response(
      JSON.stringify({
        '.tag': 'file',
        id: 'id:uploaded_1',
        name: 'notes.txt',
        path_display: '/notes.txt',
        size: 14,
        server_modified: '2026-01-01T12:00:00Z',
        content_hash: 'mock_content_hash',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const file = new Blob(['Hello, Dropbox!'], { type: 'text/plain' });
    const uploaded = await provider.uploadFile(file, '/', 'notes.txt');

    assert.strictEqual(uploaded.id, 'id:uploaded_1');
    assert.strictEqual(uploaded.name, 'notes.txt');
    assert.strictEqual(uploaded.contentHash, 'mock_content_hash');

    const apiArg = JSON.parse(requestHeaders['Dropbox-API-Arg']);
    assert.strictEqual(apiArg.path, '/notes.txt');
    assert.strictEqual(apiArg.mode, 'overwrite');
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('DropboxProvider - createFolder, deleteFile, and moveFile operate correctly', async () => {
  const provider = new DropboxProvider();
  const originalFetch = global.fetch;

  const calledEndpoints: string[] = [];

  (global as any).document = {
    cookie: 'dbx_access_token=mock_dbx_token',
  };

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    calledEndpoints.push(url);

    if (url.includes('/files/create_folder_v2')) {
      return new Response(
        JSON.stringify({
          metadata: {
            '.tag': 'folder',
            id: 'id:new_folder',
            name: 'Archives',
            path_display: '/Archives',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/files/delete_v2')) {
      return new Response(
        JSON.stringify({
          metadata: { id: 'id:deleted_item' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/files/move_v2')) {
      return new Response(
        JSON.stringify({
          metadata: {
            '.tag': 'file',
            id: 'id:moved_item',
            name: 'moved.txt',
            path_display: '/Archives/moved.txt',
            size: 100,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Default metadata check
    return new Response(JSON.stringify({ error_summary: 'path/not_found/' }), { status: 404 });
  };

  try {
    const folder = await provider.createFolder('Archives', '/');
    assert.strictEqual(folder.name, 'Archives');
    assert.strictEqual(folder.isNew, true);

    await provider.deleteFile('/old.txt');

    const moved = await provider.moveFile('/old.txt', '/Archives', 'moved.txt');
    assert.strictEqual(moved.name, 'moved.txt');

    assert.ok(calledEndpoints.some((e) => e.includes('create_folder_v2')));
    assert.ok(calledEndpoints.some((e) => e.includes('delete_v2')));
    assert.ok(calledEndpoints.some((e) => e.includes('move_v2')));
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});

test('DropboxProvider - getChanges uses cursor and extracts items and deleted IDs', async () => {
  const provider = new DropboxProvider();
  const originalFetch = global.fetch;

  (global as any).document = {
    cookie: 'dbx_access_token=mock_dbx_token',
  };

  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/files/list_folder/get_latest_cursor')) {
      return new Response(JSON.stringify({ cursor: 'cur_latest_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        entries: [
          {
            '.tag': 'file',
            id: 'id:new_file',
            name: 'updated.doc',
            path_display: '/updated.doc',
            size: 4096,
            server_modified: '2026-01-01T15:00:00Z',
          },
          {
            '.tag': 'deleted',
            id: 'id:deleted_file',
            path_display: '/removed.doc',
          },
        ],
        cursor: 'cur_next_456',
        has_more: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const changes = await provider.getChanges();
    assert.strictEqual(changes.items.length, 1);
    assert.strictEqual(changes.items[0].name, 'updated.doc');
    assert.strictEqual(changes.deletedIds.length, 1);
    assert.strictEqual(changes.deletedIds[0], '/removed.doc');
    assert.strictEqual(changes.cursor, 'cur_next_456');
    assert.strictEqual(changes.hasMore, false);
  } finally {
    global.fetch = originalFetch;
    delete (global as any).document;
  }
});
