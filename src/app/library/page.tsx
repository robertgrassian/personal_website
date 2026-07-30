// The front door to the game library. Renders nothing — it exists purely to
// read the session cookie and bounce you to the right place:
//
//   logged out              → /video-games (Robert's shelf, the public demo)
//   logged in, onboarded    → /video-games/u/{your-username}
//   logged in, no profile   → /onboarding
//
// Why a whole route for a redirect: reading cookies in a page opts that page
// into dynamic rendering, rebuilt per request instead of served static from
// the CDN. Quarantining the cookie read here keeps / and /video-games fully
// static and fast, and only this invisible hop pays for being dynamic. The
// alternative — deciding the tile's href on the homepage — would make the
// whole homepage dynamic for the sake of one link.
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchMyProfile } from "@/lib/meApi";

// Per-request (reads the session cookie) — never statically rendered.
export const dynamic = "force-dynamic";

export default async function LibraryResolverPage() {
  // No credentials on this deployment: nobody can be signed in, so the honest
  // answer is the logged-out one. Without this the page would throw and 500 —
  // the single route that a misconfigured deployment would still break.
  if (!isSupabaseConfigured()) redirect("/video-games");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session: the public shelf doubles as the logged-out demo, so visitors
  // land somewhere useful rather than on a login wall.
  if (!user) redirect("/video-games");

  const profile = await fetchMyProfile();
  // Authenticated but never picked a username — finish that first. Onboarding
  // sends them back into their own library when it completes.
  if (!profile) redirect("/onboarding");

  // redirect() throws NEXT_REDIRECT, so nothing after this line runs and the
  // component never actually returns JSX.
  redirect(`/video-games/u/${encodeURIComponent(profile.username)}`);
}
