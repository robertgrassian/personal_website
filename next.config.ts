import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    // AlaSQL's Node.js bundle optionally requires 'react-native-fetch-blob',
    // which doesn't exist in any Next.js environment. Aliasing it to false
    // tells webpack to replace it with an empty module so the build succeeds.
    // AlaSQL only needs this for its native file I/O helpers, which we never use.
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-native-fetch-blob": false,
    };
    return config;
  },
};

export default nextConfig;
