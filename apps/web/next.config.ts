import type { NextConfig } from 'next';

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Proxy same-origin: el browser llama /api-backend/* → Vercel reescribe a Render.
   * Evita CORS/preflight frágil cuando la API está bajo carga (fal/ffmpeg).
   */
  async rewrites() {
    return [
      {
        source: '/api-backend/:path*',
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
