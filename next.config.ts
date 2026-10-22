import type { NextConfig } from "next";

/**
 * Two modes:
 *  - `STUDIO_EXPORT=1 next build` → a fully static Studio that the `verifact` CLI bundles and serves.
 *  - `next dev` → proxies /api to a running `verifact studio` server (default port 4319).
 */
const exporting = process.env.STUDIO_EXPORT === "1";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  ...(exporting ? { output: "export" as const, images: { unoptimized: true }, trailingSlash: false } : {}),
  ...(exporting
    ? {}
    : {
        async rewrites() {
          const target = process.env.VERIFACT_SERVER ?? "http://127.0.0.1:4319";
          return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
        },
      }),
};

export default nextConfig;
