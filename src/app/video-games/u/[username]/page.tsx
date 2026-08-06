import type { Metadata } from "next";
import { getProfile } from "@/lib/libraryApi";
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
// page await getProfile() for the same username.
//
// For a username that exists, the fetch cache collapses those into one request
// and this costs nothing extra. For one that does not, it costs a second API
// round trip: Next does not put the 404 in the Data Cache, so neither call
// finds an entry and both reach the API. Acceptable — an unknown username is
// the rare path, and the alternative (caching misses) is what would strand a
// new user on a stale 404 of their own name.
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
