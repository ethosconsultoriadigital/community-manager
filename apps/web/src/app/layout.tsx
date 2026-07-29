import type { Metadata } from 'next';
import { Outfit, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-landing-display',
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-landing-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Community Manager Automático',
  description: 'SaaS multi-tenant para gestión de redes sociales',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} ${sourceSans.variable}`}>
      <body
        className={`${sourceSans.className} min-h-screen bg-canvas text-ink antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
