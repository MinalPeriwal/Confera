import type { NextConfig } from "next";

// Optional same-origin proxy. Only enabled when BACKEND_URL is set (e.g. self-hosted behind one domain).
// On Vercel the browser talks to the backend directly via NEXT_PUBLIC_BACKEND_URL, which is required
// for WebSockets because Vercel rewrites cannot proxy them.
const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // The dev-mode badge sits over the bottom-left of the meeting controls (the mic button).
  devIndicators: false,
  async rewrites() {
    if (!BACKEND_URL) return [];
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/ws/:path*', destination: `${BACKEND_URL}/ws/:path*` },
    ];
  },
};

export default nextConfig;
