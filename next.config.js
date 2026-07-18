/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
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
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; upgrade-insecure-requests" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ],
    }];
  },
}

module.exports = nextConfig
