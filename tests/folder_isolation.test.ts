import test from 'node:test';
import assert from 'node:assert';
import { SyncFolder } from '../lib/localFolder';
import { CloudProviderType } from '../lib/providers/types';

// Simulated filter predicate as implemented in FilesView.tsx and SettingsView.tsx
function isFolderForProvider(folder: SyncFolder, selectedProvider: CloudProviderType): boolean {
  if (selectedProvider === 'google') {
    return !folder.provider || folder.provider === 'google';
  }
  return folder.provider === selectedProvider;
}

// Simulated local files filtering for FilesView.tsx
interface LocalFileMock {
  name: string;
  path: string;
}

interface SyncStateEntryMock {
  provider?: CloudProviderType;
  remoteId?: string;
}

function filterFilesForProvider(
  localFiles: LocalFileMock[],
  syncState: Record<string, SyncStateEntryMock>,
  folderProvider: CloudProviderType | undefined,
  selectedProvider: CloudProviderType
): LocalFileMock[] {
  // If the active folder belongs to another cloud provider, do not display its local files
  if (folderProvider && folderProvider !== selectedProvider) {
    return [];
  }

  return localFiles.filter(lf => {
    const item = syncState[lf.path];
    if (item?.provider) {
      return item.provider === selectedProvider;
    }
    // For unsynced files, include only if the folder belongs to this provider (or untagged for Google)
    if (selectedProvider === 'google') {
      return !folderProvider || folderProvider === 'google';
    }
    return folderProvider === selectedProvider;
  });
}

test('Folder Isolation - folder filtering strictly isolates folders by provider', () => {
  const folders: SyncFolder[] = [
    { id: '1', name: 'GoogleNotes', savedAt: 1000, provider: 'google' },
    { id: '2', name: 'DropboxWork', savedAt: 2000, provider: 'dropbox' },
    { id: '3', name: 'OneDriveDocs', savedAt: 3000, provider: 'onedrive' },
    { id: '4', name: 'LegacyFolder', savedAt: 4000 }, // untagged defaults to google
  ];

  const googleFolders = folders.filter(f => isFolderForProvider(f, 'google'));
  assert.strictEqual(googleFolders.length, 2);
  assert.deepStrictEqual(googleFolders.map(f => f.name), ['GoogleNotes', 'LegacyFolder']);

  const dropboxFolders = folders.filter(f => isFolderForProvider(f, 'dropbox'));
  assert.strictEqual(dropboxFolders.length, 1);
  assert.strictEqual(dropboxFolders[0].name, 'DropboxWork');

  const onedriveFolders = folders.filter(f => isFolderForProvider(f, 'onedrive'));
  assert.strictEqual(onedriveFolders.length, 1);
  assert.strictEqual(onedriveFolders[0].name, 'OneDriveDocs');
});

test('Folder Isolation - local files in a Dropbox folder do not appear in Google Drive or OneDrive', () => {
  const localFiles: LocalFileMock[] = [
    { name: 'document.txt', path: 'document.txt' },
    { name: 'report.pdf', path: 'report.pdf' },
  ];

  const syncState: Record<string, SyncStateEntryMock> = {
    'document.txt': { provider: 'dropbox', remoteId: 'id:123' },
    // 'report.pdf' is not yet synced
  };

  // When viewing Dropbox with Dropbox folder: both synced and unsynced local files appear
  const dropboxView = filterFilesForProvider(localFiles, syncState, 'dropbox', 'dropbox');
  assert.strictEqual(dropboxView.length, 2);
  assert.deepStrictEqual(dropboxView.map(f => f.name), ['document.txt', 'report.pdf']);

  // When viewing Google Drive with Dropbox folder active: 0 files appear
  const googleView = filterFilesForProvider(localFiles, syncState, 'dropbox', 'google');
  assert.strictEqual(googleView.length, 0);

  // When viewing OneDrive with Dropbox folder active: 0 files appear
  const onedriveView = filterFilesForProvider(localFiles, syncState, 'dropbox', 'onedrive');
  assert.strictEqual(onedriveView.length, 0);
});

test('Folder Isolation - switching folder provider redirects its files to target provider', () => {
  const localFiles: LocalFileMock[] = [
    { name: 'fileAA.txt', path: 'fileAA.txt' },
  ];
  const syncState: Record<string, SyncStateEntryMock> = {};

  // Initially assigned to 'google'
  assert.strictEqual(filterFilesForProvider(localFiles, syncState, 'google', 'google').length, 1);
  assert.strictEqual(filterFilesForProvider(localFiles, syncState, 'google', 'dropbox').length, 0);

  // Switch to 'dropbox'
  const newProvider: CloudProviderType = 'dropbox';
  assert.strictEqual(filterFilesForProvider(localFiles, syncState, newProvider, 'dropbox').length, 1);
  assert.strictEqual(filterFilesForProvider(localFiles, syncState, newProvider, 'google').length, 0);
});
