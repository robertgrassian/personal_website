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
        // Allow cover art served by IGDB (stored as image_url on library rows)
        protocol: "https",
        hostname: "images.igdb.com",
      },
    ],
  },
  // Routes moved from snake_case to kebab-case. These are permanent (308), so
  // search engines transfer the old URLs' standing to the new ones rather than
  // treating them as separate pages — /video_games in particular has been the
  // library's public URL since launch and is what Google has indexed.
  //
  // `:path*` forwards anything nested underneath, and query strings survive a
  // redirect automatically — which matters for /video_games/login?error=…,
  // the URL Supabase's callback handlers bounced through before this rename.
  //
  // Next.js convention: redirects() is config, evaluated once at build; the
  // matching happens at the edge before any page code runs.
  async redirects() {
    return [
      { source: "/video_games/login", destination: "/video-games/start", permanent: true },
      { source: "/video_games/:path*", destination: "/video-games/:path*", permanent: true },
      { source: "/video_games", destination: "/video-games", permanent: true },
      {
        source: "/currently_playing/:path*",
        destination: "/currently-playing/:path*",
        permanent: true,
      },
      { source: "/currently_playing", destination: "/currently-playing", permanent: true },
      // The old login URL under its new prefix, for anything bookmarked
      // between the Phase 4 auth move and this rename.
      { source: "/video-games/login", destination: "/video-games/start", permanent: true },
      // Per-user libraries moved off the top-level /u namespace so the game
      // library owns one prefix. Worth having at all because /u/{username} was
      // linked from /video-games/start, which is in sitemap.ts and is the URL
      // Google's OAuth brand verification points at, so crawlers have plausibly
      // seen it even though no human has.
      //
      // TEMPORARY (307), unlike the renames above, and deliberately so. A 308 is
      // cached by the browser more or less permanently, and the spec plans for
      // /u/[username] to become a cross-library profile hub if movie/book
      // libraries ever materialize. Committing browsers to "/u/x always means
      // /video-games/u/x" would fight that, with no way to reach the ones
      // holding a cached answer. There is no ranking to preserve here, so
      // permanence buys nothing and costs future freedom.
      { source: "/u/:username", destination: "/video-games/u/:username", permanent: false },
    ];
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
