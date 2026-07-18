import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    // The private /scans dashboard was retired; send its old URLs to the public app.
    return [
      { source: "/scans", destination: "/dashboard", permanent: true },
      { source: "/scans/:path*", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
