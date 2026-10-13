import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL?.replace(/\/+$/, "");
const cpanel = process.env.CPANEL_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(cpanel ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
  env: cpanel ? { NEXT_PUBLIC_API_URL: "/api", NEXT_PUBLIC_POLLING_ONLY: "1" } : {},
  ...(!cpanel
    ? {
        async rewrites() {
          return [
            { source: "/chamado/:protocol", destination: "/acompanhar?protocol=:protocol" },
            ...(backend ? [{ source: "/api/:path*", destination: `${backend}/:path*` }] : []),
          ];
        },
      }
    : {}),
};

export default nextConfig;
