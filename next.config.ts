import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack alias (used by `npm run dev`): point alasql at its browser
  // bundle so Turbopack never tries to parse alasql.fs.js → react-native-fs.
  turbopack: {
    resolveAlias: {
      alasql: "./node_modules/alasql/dist/alasql.min.js",
    },
  },
  images: {
    remotePatterns: [
      {
        // Allow cover art served by IGDB (populated by scripts/fetch-covers.ts)
        protocol: "https",
        hostname: "images.igdb.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // FastAPI backend (api/index.py), served under /api/py.
        // Dev: `next dev` proxies to the uvicorn process on :8000 (started by
        // `npm run dev:api` / `dev:full`), preserving the full /api/py path —
        // FastAPI routes on that literal prefix.
        // Prod: Vercel has no local uvicorn; "/api/" targets the Python
        // serverless function, which receives the original request path.
        // Pattern taken from Vercel's official nextjs-fastapi template.
        source: "/api/py/:path*",
        destination:
          process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/",
      },
    ];
  },
  webpack(config) {
    // AlaSQL's package.json `main` field points to alasql.fs.js (Node build),
    // which transitively imports react-native-fs — a TypeScript file that
    // webpack can't parse. The `browser` field points to alasql.min.js, which
    // has no native dependencies. We alias the package name to the browser
    // bundle so webpack always resolves the right variant.
    config.resolve.alias = {
      ...config.resolve.alias,
      alasql: path.resolve("./node_modules/alasql/dist/alasql.min.js"),
    };
    return config;
  },
};

export default nextConfig;
