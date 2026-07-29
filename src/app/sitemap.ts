import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://rgrassian.com",
      lastModified: new Date(),
    },
    {
      url: "https://rgrassian.com/resume",
      lastModified: new Date(),
    },
    {
      url: "https://rgrassian.com/video-games",
      lastModified: new Date(),
    },
    {
      // The app's front door, and the URL Google's OAuth consent screen names
      // as the App homepage. Listed so it is discoverable on its own rather
      // than only via the sign-up banner.
      url: "https://rgrassian.com/video-games/start",
      lastModified: new Date(),
    },
  ];
}
