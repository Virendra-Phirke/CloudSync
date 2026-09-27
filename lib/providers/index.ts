/**
 * Cloud Providers Registry & Factory
 */

import { CloudProvider, CloudProviderType } from './types';
import { GoogleDriveProvider } from './google';
import { DropboxProvider } from './dropbox';
import { OneDriveProvider } from './onedrive';

export * from './types';
export * from './base';
export * from './google';
export * from './dropbox';
export * from './onedrive';

const providerInstances: Partial<Record<CloudProviderType, CloudProvider>> = {};

export function getProvider(type: CloudProviderType): CloudProvider {
  if (!providerInstances[type]) {
    switch (type) {
      case 'google':
        providerInstances[type] = new GoogleDriveProvider();
        break;
      case 'dropbox':
        providerInstances[type] = new DropboxProvider();
        break;
      case 'onedrive':
        providerInstances[type] = new OneDriveProvider();
        break;
      default:
        throw new Error(`Unsupported cloud provider: ${type}`);
    }
  }
  return providerInstances[type]!;
}

export interface ProviderMetadata {
  id: CloudProviderType;
  name: string;
  description: string;
  icon: string;
}

export function listSupportedProviders(): ProviderMetadata[] {
  return [
    {
      id: 'google',
      name: 'Google Drive',
      description: 'Sync files with Google Drive cloud storage.',
      icon: 'google',
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      description: 'Sync files with Dropbox cloud folders.',
      icon: 'dropbox',
    },
    {
      id: 'onedrive',
      name: 'Microsoft OneDrive',
      description: 'Sync files with Microsoft 365 and OneDrive.',
      icon: 'onedrive',
    },
  ];
}
