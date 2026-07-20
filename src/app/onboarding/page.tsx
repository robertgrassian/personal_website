// Onboarding resolver + username picker (Server Component).
//
// Self-resolving so /auth/confirm can always land here (spec §5.2, the
// "authenticated but no profile yet" state):
//   - not signed in        → /login
//   - signed in, onboarded → / (nothing to do here)
//   - signed in, no profile→ render the username picker
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchMyProfile } from "@/lib/meApi";
import { OnboardingForm } from "./OnboardingForm";

// Per-request (reads the session cookie) — never statically rendered.
export const dynamic = "force-dynamic";

// Derive a friendly default username from the email local-part, coerced into
// the allowed charset ([a-z0-9_-], must start alphanumeric, 3–30 chars).
function suggestUsername(email: string | undefined): string {
  const local = (email ?? "").split("@")[0].toLowerCase();
  const cleaned = local.replace(/[^a-z0-9_-]/g, "").replace(/^[^a-z0-9]+/, "");
  return cleaned.slice(0, 30).padEnd(3, "0"); // pad guarantees the 3-char min
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Already has a profile? Then onboarding is done — send them home.
  const existing = await fetchMyProfile();
  if (existing) redirect("/");

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">Pick a username</h1>
      <p className="mt-2 text-subtle">One more step — choose the handle for your game library.</p>
      <OnboardingForm suggestedUsername={suggestUsername(user.email)} />
    </main>
  );
}
