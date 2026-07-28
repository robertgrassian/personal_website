// Route-scoped layout for /currently_playing — Next.js App Router convention.
// Importing the CSS here (rather than globals.css) keeps it out of the global
// entry and loads it with this segment. Note: a plain (non-module) CSS import is
// still global once loaded — nothing route-scopes the rules themselves. What
// keeps these styles from colliding with other pages is the `pcrt-` class
// namespace used throughout crt.css, not the import location. The CRT is shared
// with the library pages, which pull the same stylesheet in via LibraryPage.
import "@/components/crt/crt.css";

export default function CurrentlyPlayingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
