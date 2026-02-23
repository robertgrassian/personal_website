import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://robertgrassian.com",
      lastModified: new Date(),
    },
    {
      url: "https://robertgrassian.com/resume",
      lastModified: new Date(),
    },
    {
      url: "https://robertgrassian.com/video_games",
      lastModified: new Date(),
    },
  ];
}
