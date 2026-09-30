import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/forgot-password'],
        disallow: [
          '/inicio',
          '/composer',
          '/approvals',
          '/calendar',
          '/cuentas',
          '/reportes',
          '/radar',
          '/biblioteca',
          '/admin',
          '/perfil',
          '/guia',
          '/reset-password',
          '/api/',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
