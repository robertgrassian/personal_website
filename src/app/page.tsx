import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold">Robert Grassian</h1>
      <p className="mt-2 text-lg text-muted">Software Engineer</p>

      <nav className="mt-6 flex gap-4">
        <Link href="/resume" className="text-link hover:underline">
          Resume
        </Link>
        <Link href="/video_games" className="text-link hover:underline">
          Game Library
        </Link>
      </nav>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold">About Me</h2>
        <p className="mt-4 text-muted italic">
          I am a software engineer with a passion for building scalable and efficient applications.
          I&apos;m primarily a backend engineer, and I enjoy learning new technologies and improving
          my skills.
        </p>
        <p className="mt-4 text-muted italic">
          Raised in LA (San Pedro) <br /> Computer Science degree from UC Berkeley <br /> Lived in
          SF &rarr; NYC.
        </p>
        <p className="mt-4 text-muted italic">
          Currently working at Harness on the Feature Management and Experimentation module, focused
          on building out our experimentation capabilities.
        </p>
      </section>
    </div>
  );
}
