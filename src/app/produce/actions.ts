"use server";

// Server Actions (a React feature that Next wires up): the browser posts the form, this runs on
// the server, and its Set-Cookie and redirect come back in the same response.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PRODUCE_STATE_COOKIE,
  PRODUCE_STATE_COOKIE_MAX_AGE,
  produceStatePath,
} from "@/lib/produce/resolveState";
import { stateByCode } from "@/lib/produce/states";
import { MAX_SLUG_LENGTH, SLUG_PATTERN, isIsoDate } from "@/lib/produce/tastings";
import { markMyTasting, unmarkMyTasting, type MutateResult } from "@/lib/meApi";

// The one place the produce_state cookie is written: an explicit pick, never a geo guess.
// Server-set rather than document.cookie because Safari caps script-written cookies at 7 days.
export async function chooseProduceState(formData: FormData): Promise<void> {
  const raw = formData.get("state");
  // Anyone can post to an action, so the code is validated here, not trusted from the <select>.
  const state = typeof raw === "string" ? stateByCode(raw) : undefined;
  if (!state) redirect("/produce");

  (await cookies()).set(PRODUCE_STATE_COOKIE, state.code.toLowerCase(), {
    maxAge: PRODUCE_STATE_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(produceStatePath(state.code));
}

// Tasting writes: browser → these actions → meApi (session cookie → Bearer JWT) → FastAPI.
// No revalidateTag, unlike the library's actions: tastings are read per viewer from the browser
// and never cached, so there is nothing to purge.

const BAD_REQUEST: MutateResult = { ok: false, message: "That could not be saved." };

// An action is a public POST endpoint, so arguments are checked here, not trusted from the caller.
// They are also interpolated into the API path.
function validSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

export async function markTasting(slug: string, eatenOn: string): Promise<MutateResult> {
  if (!validSlug(slug) || typeof eatenOn !== "string" || !isIsoDate(eatenOn)) return BAD_REQUEST;
  return markMyTasting(slug, eatenOn);
}

export async function unmarkTasting(year: number, slug: string): Promise<MutateResult> {
  if (!validSlug(slug) || !Number.isInteger(year) || year < 2020 || year > 9999) {
    return BAD_REQUEST;
  }
  return unmarkMyTasting(year, slug);
}
