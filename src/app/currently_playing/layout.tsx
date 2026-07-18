// Route-scoped layout for /currently_playing — Next.js App Router convention.
// CSS imported in a Server Component layout is bundled and applied only when this
// route is active. The photorealistic CRT styles live in a file of their own
// (rather than globals.css) so they never leak into other pages.
import "./crt.css";

export default function CurrentlyPlayingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
