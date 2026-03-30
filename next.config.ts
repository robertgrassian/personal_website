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
