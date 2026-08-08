import type {Metadata} from 'next';
import './globals.css';
import { ToastProvider } from '../components/ToastContext';
import { ThemeProvider } from '../components/ThemeContext';
import { AutoSyncManager } from '../components/AutoSyncManager';

export const metadata: Metadata = {
  title: 'CloudSync',
  description: 'A beautiful local-to-cloud synchronization tool.',
  icons: {
    icon: '/Icon/cloudSynce-logo.svg',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <AutoSyncManager />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
