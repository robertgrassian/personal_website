// Route-scoped layout for /video_games — Next.js App Router convention.
// CSS imports in Server Components (layouts and pages) are bundled by Next.js.
// This is the right place to import styles that apply only to this route.
import "./video_games.css";

export default function VideoGamesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
