import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';

/** Panel autenticado: no indexar en buscadores. */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
