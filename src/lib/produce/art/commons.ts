import type { ArtKind, ArtSource } from "../types.ts";

const COMMONS = "https://commons.wikimedia.org/wiki/";

// A source whose pictures all come from Wikimedia Commons: the credit links to a Commons category
// and each picture to its own File page, so a manifest is only slugs and file names.
export function commonsSource(source: {
  id: string;
  name: string;
  category: string;
  license: string;
  kind: ArtKind;
  // slug → the file's name on Commons.
  files: Readonly<Record<string, string>>;
}): ArtSource {
  return {
    id: source.id,
    credit: {
      name: source.name,
      url: `${COMMONS}Category:${encodeURIComponent(source.category.replaceAll(" ", "_"))}`,
    },
    license: source.license,
    kind: source.kind,
    images: Object.fromEntries(
      Object.entries(source.files).map(([slug, file]) => [
        slug,
        {
          file: `produce/art/${source.id}/${slug}.jpg`,
          sourceUrl: `${COMMONS}File:${encodeURIComponent(file.replaceAll(" ", "_"))}`,
        },
      ])
    ),
  };
}
