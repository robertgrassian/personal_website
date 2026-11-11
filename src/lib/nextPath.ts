// Open-redirect guard for the post-sign-in `next` parameter. Only a path on
// this site passes; anything else becomes `fallback`.
//
// - Exactly one leading slash: `//evil.com` is a protocol-relative URL to
//   another host, and anything not starting with `/` (`https://…`,
//   `@evil.com`) is either absolute or rewrites the host once appended to an
//   origin.
// - No backslash: browsers normalize `\` to `/` in URLs, so `/\evil.com` is
//   read as `//evil.com`. The route handlers prepend an origin and were safe
//   from this, but /sign-in hands `next` to the browser as a relative URL.
// - No control characters: browsers strip tab and newline from URLs, so
//   `/\t/evil.com` collapses to `//evil.com` after this check has passed.
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}

// The /sign-in URL that returns to `next` afterwards, optionally carrying one
// of the error flags SignInPanel knows how to word.
export function signInPath(next: string, error?: "oauth_failed" | "link_invalid"): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  params.set("next", next);
  return `/sign-in?${params}`;
}
