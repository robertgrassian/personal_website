import { GitHubIcon } from "@/components/Icon";
import { ISSUES_URL, NEW_ISSUE_URL } from "@/lib/feedback";

// The library's "tell me what is wrong or missing" footer, on every library
// page (both routes, every viewer, signed in or not).
//
// No "use client": this is a plain Server Component, so it ships zero
// JavaScript. Anchors, not next/link, because both targets are off-site and
// next/link's prefetching and client-side navigation have nothing to do there.
export function FeedbackFooter() {
  return (
    <footer className="mt-12 border-t border-shelf-plank pt-6">
      <p className="text-sm text-shelf-text-muted">
        Found a bug, or thought of something this library should do? Tell me on GitHub.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* rel="noopener noreferrer" is required with target="_blank": without
            noopener the opened tab gets a window.opener handle back to this
            one and can navigate it elsewhere. */}
        <a
          href={NEW_ISSUE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-shelf-text underline underline-offset-4 transition-colors hover:text-link"
        >
          {/* Decorative: the link text already says where this goes, so the
              icon would only repeat it to a screen reader. */}
          <GitHubIcon className="h-4 w-4" aria-hidden />
          Report a bug or suggest a feature
        </a>
        <a
          href={ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-shelf-text-muted underline underline-offset-4 transition-colors hover:text-shelf-text"
        >
          See what is already reported
        </a>
      </div>
    </footer>
  );
}
