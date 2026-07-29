// The product's name, in one place because an external system depends on it.
//
// Google's OAuth brand verification compares the App name configured in the
// Cloud console against the name shown on the App homepage
// (/video-games/start). A mismatch is a rejection, and the consent screen
// falls back to displaying the raw supabase.co host instead of a product name.
//
// So this string is effectively part of an external contract: changing it means
// updating the Google Cloud console in the same breath, and re-verifying. It
// lives alone in this module so both surfaces that render it — the landing page
// heading and the sign-up banner on Robert's library — read the same constant
// rather than two literals that can drift apart.
//
// "Robert's" is deliberately not part of it. That belongs to one person's
// library, not to the product other people sign into.
export const APP_NAME = "Video Game Library";
