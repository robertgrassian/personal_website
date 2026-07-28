import type { Metadata } from "next";
import { getProfile } from "@/lib/profileServer";
import { LibraryPage } from "@/components/video_games/LibraryPage";

// Any user's library, public and read-only to everyone but its owner
// (spec decision #6: no private libraries in v1). Renders the library
// directly rather than nesting under a profile hub — decision #17.
//
// Next.js dynamic route: the [username] folder name becomes a route param.
// In Next 15 `params` is a Promise and must be awaited — a change from 14,
// where it was a plain object.
type PageProps = { params: Promise<{ username: string }> };

// Next calls this alongside the page render to build <head>. Both it and the
// page await getProfile() for the same username; the fetch cache collapses
// that into one request, so this costs nothing extra.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: "Library not found" };
  return {
    title: `${profile.displayName}'s Video Game Library`,
    description: `Every video game ${profile.displayName} has played.`,
  };
}

export default async function UserLibraryPage({ params }: PageProps) {
  const { username } = await params;
  // No `heading`: LibraryPage derives it from the profile it fetches. The 404
  // for an unknown username is raised there too, since it needs that fetch
  // anyway.
  return <LibraryPage username={username} />;
}
