"use client";

// usePathname is a Next.js App Router hook — reads the current URL path on the client.
// It re-renders this component whenever the route changes, keeping the active link in sync.
import Link from "next/link";
import { usePathname } from "next/navigation";
// Caveat is loaded via Next.js font optimization: downloaded at build time, served locally,
// and injected as a CSS variable — no third-party font request at runtime.
import { Caveat } from "next/font/google";

const caveat = Caveat({
  weight: "700",
  subsets: ["latin"],
  display: "swap",
});

const links = [
  { href: "/about", label: "About" },
  { href: "/video_games", label: "Game Library" },
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
    <nav className="sticky top-0 z-50 border-b border-divider bg-background/90 backdrop-blur-sm">
      <div className="px-6 h-[var(--nav-height)] flex items-center justify-between">
        {/* Site name — two-line display with Caveat, links back to home */}
        <Link
          href="/"
          className={`${caveat.className} text-2xl leading-tight text-foreground hover:text-link transition-colors duration-150`}
        >
          {/* Two separate spans so each word sits on its own line */}
          <span className="block">Robert</span>
          <span className="block">Grassian</span>
        </Link>

        {/* Page links — active route gets the amber accent color */}
        <ul className="flex items-center gap-6 list-none">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                // pathname.startsWith handles nested routes (e.g. /video_games/some-game)
                className={`text-sm transition-colors duration-150 ${
                  pathname.startsWith(href)
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
