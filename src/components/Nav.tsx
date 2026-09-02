"use client";

// usePathname is a Next.js App Router hook — reads the current URL path on the client.
// It re-renders this component whenever the route changes, keeping the active link in sync.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { caveat } from "../lib/fonts";

// `activePaths` exists because the link target and the page you end up on are
// not always the same URL. /library is a redirect-only resolver (it sends you
// to /video-games or /video-games/u/{you}), so matching the active state
// against its own href would never highlight it. Defaults to [href] for the
// ordinary links.
//
// Two entries cover the library now that per-user pages are nested: matching is
// startsWith, so /video-games also catches /video-games/u/{username} and
// /video-games/start. A third entry for /u/ was needed while those pages lived
// at the top level.
const links: { href: string; label: string; activePaths?: string[] }[] = [
  { href: "/about", label: "About" },
  { href: "/library", label: "Game Library", activePaths: ["/library", "/video-games"] },
  { href: "/resume", label: "Resume" },
];

export function Nav() {
  const pathname = usePathname();

  // The homepage has its own tile-based navigation, so the nav bar would be redundant there.
  if (pathname === "/") return null;

  return (
    // sticky top-0 keeps the nav visible while scrolling.
    // backdrop-blur-sm + bg-background/90 = frosted glass that lets a hint of page content show through.
    // z-50 ensures the nav sits above all page content, including sticky filter bars (z-20).
    <nav className="sticky top-0 z-50 border-b border-divider bg-background/90 backdrop-blur-sm pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)]">
      {/* Everything scales down only below `sm`, from when the auth control
          still lived here and pushed the row past a phone's width. Kept after
          it moved into the library: the smaller phone type reads fine and
          leaves room for a fourth link later. The bar's height is fixed by
          --nav-height, so type size changes nothing for GameShelves/StatsPanel,
          which offset their sticky position by --nav-offset: that height plus
          the safe-area padding above it. */}
      <div className="px-4 sm:px-6 h-[var(--nav-height)] flex items-center justify-between gap-3">
        {/* Site name — two-line display with Caveat, links back to home */}
        <Link
          href="/"
          className={`${caveat.className} text-xl sm:text-2xl leading-tight text-foreground hover:text-link transition-colors duration-150 whitespace-nowrap`}
        >
          {/* Two separate spans so each word sits on its own line */}
          <span className="block">Robert</span>
          <span className="block">Grassian</span>
        </Link>

        {/* Page links — active route gets the accent color */}
        <ul className="flex items-center gap-3 sm:gap-6 list-none">
          {links.map(({ href, label, activePaths }) => (
            <li key={href}>
              <Link
                href={href}
                // startsWith handles nested routes (e.g. /video-games/start)
                className={`text-xs sm:text-sm whitespace-nowrap transition-colors duration-150 ${
                  (activePaths ?? [href]).some((p) => pathname.startsWith(p))
                    ? "text-link font-medium"
                    : "text-subtle hover:text-link"
                }`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
