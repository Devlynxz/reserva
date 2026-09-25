import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Logo uploads are capped at 1 MB by the action itself; leave room for the form around it.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
