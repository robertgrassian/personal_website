import Image from "next/image";
import Link from "next/link";

const sections = [
  {
    href: "/about",
    title: "About Me",
    description: "LA → SF → NYC",
  },
  {
    href: "/video_games",
    title: "Game Library",
    description: "Every game I've ever played",
  },
  {
    href: "/resume",
    title: "Resume",
    description: "Work history, skills, and experience",
  },
];

export default function Home() {
  return (
    // overflow-hidden prevents any scroll — everything lives within the viewport
    <main className="relative h-dvh flex flex-col overflow-hidden">
      {/* Full-page background image — fill spans the positioned parent (main) */}
      <Image
        src="/images/san-pedro-cliffs.jpeg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      {/* Gradient overlay: subtler at top (sky looks great), darker at bottom where tiles sit */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/40 to-black/65 dark:from-black/40 dark:via-black/55 dark:to-black/75" />

      {/* Name + tagline — flex-1 pushes this to fill available space, centering it above the tiles */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight">
            Robert Grassian
          </h1>
          <p className="mt-3 text-base sm:text-xl text-white/75 tracking-wide">
            Software Engineer &middot; Backend Systems &amp; Experimentation
          </p>
        </div>
      </div>

      {/* Tiles pinned to the bottom of the viewport */}
      <div className="relative z-10 px-4 sm:px-6 pb-8 sm:pb-12">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-3 sm:gap-4">
          {sections.map((s) => (
            // backdrop-blur-sm + bg-white/10 = frosted glass effect over the photo
            // `group` lets the h2 inside respond to the Link's hover state
            // text-white and bg-white/* have no dark: variants intentionally —
            // the photo + overlay guarantee a dark surface in both color schemes
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col items-center justify-center p-3 sm:p-5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:border-white/40 transition-all duration-200 text-center"
            >
              <h2 className="text-sm sm:text-base font-semibold text-white">{s.title}</h2>
              {/* Description hidden on mobile — 3 narrow columns leave no room for wrapping text */}
              <p className="mt-1 text-xs sm:text-sm text-white/65 leading-snug hidden sm:block">
                {s.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
