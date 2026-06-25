import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/scans/opengraph-image": ["./public/fonts/**", "./app/scans/dumpsterfireguy.png"],
  },
};

export default nextConfig;
