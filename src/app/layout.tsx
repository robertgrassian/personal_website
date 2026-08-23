import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { RectLogOverlay } from "@/components/dev/RectLogOverlay";
import { authFlagScript } from "@/lib/authFlag";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// viewportFit "cover" lets the page paint into the device safe areas instead
// of being inset out of them, so a `fixed; inset: 0` overlay reaches the notch
// and home-indicator edges. The --safe-* tokens in globals.css report non-zero
// values only once this is set, and everything pinned to a viewport edge
// consumes them to pad itself back out.
//
// This shipped as an attempted fix for the modal backdrop's uncovered strip
// and did not fix it; see ModalBackdrop.tsx for what did. Kept because
// handling the safe areas is correct on its own terms.
//
// Not `interactiveWidget`, which is the obvious next reach when a software
// keyboard reshapes the viewport under a dialog: WebKit does not implement it.
// Captures from three browsers on an iPhone were identical with
// "overlays-content" set and unset, so it is documented here rather than left
// in the file looking load-bearing. See useModalChrome for what does work.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Base for resolving relative OG/Twitter image URLs. Without it Next falls
  // back to localhost during build, so social-preview images would point at
  // the wrong host in production.
  metadataBase: new URL("https://rgrassian.com"),
  title: "Robert Grassian",
  description: "Personal website of Robert Grassian",
};

// Module scope: built once per server process, not per request.
const AUTH_FLAG_SCRIPT = authFlagScript(process.env.NEXT_PUBLIC_SUPABASE_URL);

const IS_LOCAL = process.env.VERCEL !== "1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is load-bearing: the script below stamps
    // data-authed on this element before React hydrates, so the real DOM no
    // longer matches the server's output.
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Pre-paint auth flag (src/lib/authFlag.ts). Must be a plain <script>
            first in <body>, NOT next/script: a classic inline script blocks the
            parser where it appears, which is the property being relied on. All
            of next/script's strategies defer past first paint. Empty when the
            Supabase URL is absent, falling back to post-hydration resolution. */}
        {AUTH_FLAG_SCRIPT && <script dangerouslySetInnerHTML={{ __html: AUTH_FLAG_SCRIPT }} />}
        <Nav />
        {children}
        {/* Viewport recorder for debugging layout on a real phone, and inert
            without ?debug in the URL. See docs/mobile-viewport.md.

            VERCEL, not NODE_ENV: it has to be available against a local
            production build, since StrictMode's double-mounted effects are a
            real source of one-frame artifacts and ruling them out means
            building without it. Vercel sets VERCEL=1 in every deployed
            environment, so this renders only on a machine running the app
            locally, and the condition resolves at build time. Read here in a
            Server Component, so the unprefixed name is the right one. */}
        {IS_LOCAL && <RectLogOverlay />}
      </body>
    </html>
  );
}
