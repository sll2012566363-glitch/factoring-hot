/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.pbc.gov.cn',
      },
      {
        protocol: 'https',
        hostname: '*.nfra.gov.cn',
      },
    ],
    unoptimized: true,
  },
  async rewrites() {
    return [
      // Map .xml URLs to actual route handlers
      { source: '/feed.xml', destination: '/feed' },
      { source: '/feed/all.xml', destination: '/feed/all' },
      { source: '/feed/daily.xml', destination: '/feed/daily' },
      { source: '/feed/category/:cat.xml', destination: '/feed/category/:cat' },
    ];
  },
}

module.exports = nextConfig
