"use server";

// Server Action backing the onboarding form. "use server" marks every export
// as a server-side function the client can invoke like an RPC — the closest
// analogy is a controller method the form POSTs to, except Next generates the
// wiring. It runs on the server, so it can read the httpOnly session cookie
// (via meApi) and forward the Bearer token to FastAPI.
import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { createMyProfile } from "@/lib/meApi";
import { followsTag, libraryCacheTag } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";
import { userLibraryPath } from "@/lib/profile";

// The shape useActionState threads between submissions. null = untouched.
export type OnboardingState = { error: string } | null;

export async function submitOnboarding(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();

  const result = await createMyProfile(username, displayName);

  if (!result.ok) {
    // Return the error to the form; useActionState re-renders with it.
    return { error: result.message };
  }

  // Purge anything cached under this username BEFORE redirecting to it.
  //
  // Defensive, not a fix for an observed bug. The worry was that a handle
  // requested while it was still free (someone checking whether it was taken,
  // a crawler) would leave a cached "no such user" under the name its new
  // owner is about to be sent to — stranding them on their own 404, since the
  // only other thing that clears the tag is one of their own writes and there
  // is no write UI on a 404 page.
  //
  // Measured on Next 15.5.14, that does not happen: the profile read is
  // force-cached, but a 404 never lands in the Data Cache. Requesting an
  // unknown username three times hit the API on all three (twice each, once
  // for generateMetadata and once for the page), while a known username hit it
  // zero times. So this call currently purges a tag that holds nothing.
  //
  // Kept anyway because it costs one no-op call and the failure it guards is
  // both silent and unrecoverable for the affected user. Next's caching of
  // non-OK responses is an implementation detail, not a documented guarantee,
  // and it is the kind of thing a minor release can change underneath us.
  //
  // The umbrella tag on purpose, not a narrow one: the thing being guarded
  // against is a cached 404 for a username that had no rows at all, so there is
  // no single resource to name. This is exactly the "purge everything for this
  // user" case the umbrella tag exists for.
  revalidateTag(libraryCacheTag(result.profile.username));

  // The founder's page changes too, and nothing else purges it. Signup creates
  // TWO follow edges (new user → founder and back, api/app/services/me.py), so
  // it moves the founder's follower count, following count and both lists.
  // Without this, /video-games serves its prerendered follower count until some
  // unrelated write of Robert's happens to purge the tag.
  //
  // followsTag rather than the umbrella tag: signup cannot touch the founder's
  // games or wishlist, so purging those would re-fetch a 155-game library to
  // publish a changed follower count.
  //
  // Safe to hardcode: the founder handle is a constant on both sides
  // (LIBRARY_OWNER_USERNAME here, FOUNDER_USERNAME in api/app/core/config.py).
  revalidateTag(followsTag(LIBRARY_OWNER_USERNAME));

  // Success: profile created. redirect() throws NEXT_REDIRECT, which Next
  // turns into a client navigation — so nothing after this line runs, and the
  // function's declared return type is never actually reached on success.
  //
  // Straight into the brand-new (empty) library rather than the portfolio
  // home: the library is what they just signed up for, and landing on
  // rgrassian.com instead reads as "nothing happened". Uses the created
  // profile's username rather than the submitted string so the casing is the
  // canonical one the API stored.
  redirect(userLibraryPath(result.profile.username));
}
