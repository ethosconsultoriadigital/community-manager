import type { Metadata } from 'next';
import { Outfit, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { getSiteUrl } from '@/lib/site-url';
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

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Community Manager | Ethos Consultoría Digital',
    template: '%s | Community Manager',
  },
  description:
    'Plataforma para gestionar y publicar en redes sociales de varios clientes, con aprobación humana y APIs oficiales.',
  applicationName: 'Community Manager',
  keywords: [
    'community manager',
    'redes sociales',
    'publicación',
    'Ethos',
    'Meta',
    'Instagram',
    'Facebook',
  ],
  authors: [{ name: 'Ethos Consultoría Digital' }],
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: siteUrl,
    siteName: 'Community Manager',
    title: 'Community Manager | Ethos Consultoría Digital',
    description:
      'Gestiona redes sociales de varios clientes con aprobación humana y publicación vía APIs oficiales.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Community Manager | Ethos',
    description:
      'SaaS multi-tenant para community management con aprobación humana.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl,
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('cm_theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} ${sourceSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${sourceSans.className} min-h-screen bg-canvas text-ink antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
