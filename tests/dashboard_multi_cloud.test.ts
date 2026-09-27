import test from 'node:test';
import assert from 'node:assert';
import { CloudProviderType, CloudQuota } from '../lib/providers/types';

interface ProviderQuotaState {
  connected: boolean;
  quota: CloudQuota | null;
}

// Logic replicated from Dashboard.tsx
function computeMultiCloudStorage(providers: Record<CloudProviderType, ProviderQuotaState>) {
  const googleUsed = providers.google.quota?.usedBytes || 0;
  const dropboxUsed = providers.dropbox.quota?.usedBytes || 0;
  const onedriveUsed = providers.onedrive.quota?.usedBytes || 0;

  const totalCloudCapacity =
    (providers.google.quota?.totalBytes || 0) +
    (providers.dropbox.quota?.totalBytes || 0) +
    (providers.onedrive.quota?.totalBytes || 0);

  const totalCloudUsed = googleUsed + dropboxUsed + onedriveUsed;
  const totalCloudFree = Math.max(0, totalCloudCapacity - totalCloudUsed);

  const overallPercent = totalCloudCapacity > 0
    ? Math.round((totalCloudUsed / totalCloudCapacity) * 100)
    : 0;

  const connectedList = (Object.keys(providers) as CloudProviderType[]).filter(p => providers[p].connected);

  return {
    googleUsed,
    dropboxUsed,
    onedriveUsed,
    totalCloudCapacity,
    totalCloudUsed,
    totalCloudFree,
    overallPercent,
    connectedCount: connectedList.length,
    connectedList,
  };
}

function computeStorageChartData(googleUsed: number, dropboxUsed: number, onedriveUsed: number, totalCloudFree: number) {
  const data: Array<{ name: string; value: number; color: string }> = [];
  if (googleUsed > 0) data.push({ name: 'Google Drive', value: googleUsed, color: '#10b981' });
  if (dropboxUsed > 0) data.push({ name: 'Dropbox', value: dropboxUsed, color: '#0061FF' });
  if (onedriveUsed > 0) data.push({ name: 'OneDrive', value: onedriveUsed, color: '#0078D4' });
  if (totalCloudFree > 0 || data.length === 0) {
    data.push({ name: 'Free Space', value: totalCloudFree > 0 ? totalCloudFree : 1, color: '#262626' });
  }
  return data;
}

interface MockDashboardItem {
  id: string;
  name: string;
  provider: CloudProviderType;
  modifiedTime: number;
}

function filterRecentActivity(
  items: MockDashboardItem[],
  providerFilter: 'all' | CloudProviderType,
  query: string
) {
  return items
    .filter(item => {
      const matchProvider = providerFilter === 'all' || item.provider === providerFilter;
      const matchQuery = item.name.toLowerCase().includes(query.toLowerCase());
      return matchProvider && matchQuery;
    })
    .sort((a, b) => b.modifiedTime - a.modifiedTime);
}

test('Multi-Cloud Dashboard - aggregates quotas across Google Drive, Dropbox, and OneDrive', () => {
  const providers: Record<CloudProviderType, ProviderQuotaState> = {
    google: {
      connected: true,
      quota: { totalBytes: 15 * 1024 * 1024 * 1024, usedBytes: 5 * 1024 * 1024 * 1024, freeBytes: 10 * 1024 * 1024 * 1024 },
    },
    dropbox: {
      connected: true,
      quota: { totalBytes: 2 * 1024 * 1024 * 1024, usedBytes: 1 * 1024 * 1024 * 1024, freeBytes: 1 * 1024 * 1024 * 1024 },
    },
    onedrive: {
      connected: true,
      quota: { totalBytes: 5 * 1024 * 1024 * 1024, usedBytes: 2 * 1024 * 1024 * 1024, freeBytes: 3 * 1024 * 1024 * 1024 },
    },
  };

  const stats = computeMultiCloudStorage(providers);

  assert.strictEqual(stats.connectedCount, 3);
  assert.strictEqual(stats.totalCloudCapacity, 22 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.totalCloudUsed, 8 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.totalCloudFree, 14 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.overallPercent, 36); // 8/22 = ~36.36% -> 36%
});

test('Multi-Cloud Dashboard - correctly handles partial connections (e.g. only Dropbox & OneDrive)', () => {
  const providers: Record<CloudProviderType, ProviderQuotaState> = {
    google: { connected: false, quota: null },
    dropbox: {
      connected: true,
      quota: { totalBytes: 2 * 1024 * 1024 * 1024, usedBytes: 1 * 1024 * 1024 * 1024 },
    },
    onedrive: {
      connected: true,
      quota: { totalBytes: 5 * 1024 * 1024 * 1024, usedBytes: 1 * 1024 * 1024 * 1024 },
    },
  };

  const stats = computeMultiCloudStorage(providers);

  assert.strictEqual(stats.connectedCount, 2);
  assert.strictEqual(stats.totalCloudCapacity, 7 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.totalCloudUsed, 2 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.totalCloudFree, 5 * 1024 * 1024 * 1024);
  assert.strictEqual(stats.overallPercent, 29);
});

test('Multi-Cloud Dashboard - builds chart segments for all active clouds', () => {
  const chart = computeStorageChartData(
    5 * 1024 * 1024 * 1024, // Google
    1 * 1024 * 1024 * 1024, // Dropbox
    2 * 1024 * 1024 * 1024, // OneDrive
    14 * 1024 * 1024 * 1024 // Free
  );

  assert.strictEqual(chart.length, 4);
  assert.strictEqual(chart[0].name, 'Google Drive');
  assert.strictEqual(chart[0].color, '#10b981');
  assert.strictEqual(chart[1].name, 'Dropbox');
  assert.strictEqual(chart[1].color, '#0061FF');
  assert.strictEqual(chart[2].name, 'OneDrive');
  assert.strictEqual(chart[2].color, '#0078D4');
  assert.strictEqual(chart[3].name, 'Free Space');
});

test('Multi-Cloud Dashboard - filters recent activity across cloud providers', () => {
  const items: MockDashboardItem[] = [
    { id: '1', name: 'google_doc.pdf', provider: 'google', modifiedTime: 1000 },
    { id: '2', name: 'dropbox_sheet.xlsx', provider: 'dropbox', modifiedTime: 3000 },
    { id: '3', name: 'onedrive_presentation.pptx', provider: 'onedrive', modifiedTime: 2000 },
    { id: '4', name: 'dropbox_image.png', provider: 'dropbox', modifiedTime: 4000 },
  ];

  // All
  const all = filterRecentActivity(items, 'all', '');
  assert.strictEqual(all.length, 4);
  assert.strictEqual(all[0].name, 'dropbox_image.png'); // Most recent first

  // Dropbox only
  const dbxOnly = filterRecentActivity(items, 'dropbox', '');
  assert.strictEqual(dbxOnly.length, 2);
  assert.strictEqual(dbxOnly.every(f => f.provider === 'dropbox'), true);

  // OneDrive only
  const oneOnly = filterRecentActivity(items, 'onedrive', '');
  assert.strictEqual(oneOnly.length, 1);
  assert.strictEqual(oneOnly[0].name, 'onedrive_presentation.pptx');

  // Search filter
  const searchResult = filterRecentActivity(items, 'all', 'doc');
  assert.strictEqual(searchResult.length, 1);
  assert.strictEqual(searchResult[0].name, 'google_doc.pdf');
});
