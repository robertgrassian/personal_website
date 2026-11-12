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
