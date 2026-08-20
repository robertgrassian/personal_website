import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
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
      </body>
    </html>
  );
}
