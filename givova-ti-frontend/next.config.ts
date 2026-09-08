import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return backend
      ? [
          {
            source: "/api/:path*",
            destination: `${backend}/:path*`,
          },
        ]
      : [];
  },
};

export default nextConfig;