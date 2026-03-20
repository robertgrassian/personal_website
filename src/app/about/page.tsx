import Image from "next/image";
import { BackToHome } from "@/components/BackToHome";
import { GitHubIcon, LinkedInIcon } from "@/components/Icon";

export default function About() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <BackToHome />

      <h1 className="mt-8 text-3xl font-bold text-foreground">About Me</h1>

      <div className="mt-6 space-y-4 text-body leading-relaxed">
        <p>
          I am a software engineer with a passion for building scalable and efficient applications.
          I&apos;m primarily a backend engineer, and I enjoy learning new technologies and improving
          my skills.
        </p>
        <p>
          Raised in LA (San Pedro)
          <br />
          CS degree from UC Berkeley
          <br />
          LA &rarr; SF &rarr; NYC
        </p>

        <p>
          Currently working at Harness on the Feature Management and Experimentation module, focused
          on building out our experimentation capabilities.
        </p>
      </div>

      {/* Social links — intentionally muted; hover brightens to the site accent color */}
      <div className="mt-6 flex items-center gap-6">
        <a
          href="https://github.com/robertgrassian"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="flex items-center gap-2 text-subtle hover:text-link transition-colors duration-150"
        >
          <GitHubIcon className="w-5 h-5 shrink-0" aria-hidden />
          <span className="text-sm">GitHub</span>
        </a>

        <a
          href="https://linkedin.com/in/robertgrassian"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LinkedIn"
          className="flex items-center gap-2 text-subtle hover:text-link transition-colors duration-150"
        >
          <LinkedInIcon className="w-5 h-5 shrink-0" aria-hidden />
          <span className="text-sm">LinkedIn</span>
        </a>
      </div>

      {/*
        PHOTOS
      */}

      {/*
        CSS columns masonry — each photo gets the full column width and renders
        at its natural aspect ratio. New photos can be added to the array below
        and will flow into the layout automatically.
        `break-inside-avoid` prevents a single figure from splitting across columns.
      */}
      <div className="mt-12 columns-1 sm:columns-2 gap-6">
        {[
          // width/height must match each image's actual display aspect ratio —
          // the browser uses them to reserve space before the image loads (prevents layout shift)
          {
            src: "/images/kirby-cliffs.jpeg",
            alt: "Kirby at the San Pedro cliffs",
            caption: "My dog Kirby",
            width: 900,
            height: 1200,
          },
          {
            src: "/images/san-pedro.jpeg",
            alt: "San Pedro cliffs",
            caption: "San Pedro",
            width: 1200,
            height: 900,
          },
        ].map((photo) => (
          <figure key={photo.src} className="break-inside-avoid mb-6">
            <div className="rounded-lg overflow-hidden">
              {/*
                width + height set the intrinsic aspect ratio for layout — next/image
                uses these to reserve space, but the image is resized to 100% width
                via the className. This is how you get natural-height images (no fill).
              */}
              <Image
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                sizes="(max-width: 640px) 100vw, 50vw"
                className="w-full h-auto"
              />
            </div>
            <figcaption className="mt-2 text-sm text-muted">{photo.caption}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
