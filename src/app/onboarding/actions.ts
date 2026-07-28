"use server";

// Server Action backing the onboarding form. "use server" marks every export
// as a server-side function the client can invoke like an RPC — the closest
// analogy is a controller method the form POSTs to, except Next generates the
// wiring. It runs on the server, so it can read the httpOnly session cookie
// (via meApi) and forward the Bearer token to FastAPI.
import { redirect } from "next/navigation";
import { createMyProfile } from "@/lib/meApi";

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

  // Success: profile created. redirect() throws NEXT_REDIRECT, which Next
  // turns into a client navigation — so nothing after this line runs, and the
  // function's declared return type is never actually reached on success.
  //
  // Straight into the brand-new (empty) library rather than the portfolio
  // home: the library is what they just signed up for, and landing on
  // rgrassian.com instead reads as "nothing happened". Uses the created
  // profile's username rather than the submitted string so the casing is the
  // canonical one the API stored.
  redirect(`/u/${encodeURIComponent(result.profile.username)}`);
}
