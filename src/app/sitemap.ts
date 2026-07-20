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
      url: "https://rgrassian.com/video_games",
      lastModified: new Date(),
    },
  ];
}
