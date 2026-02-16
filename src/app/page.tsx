import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold">Robert Grassian</h1>
      <p className="mt-2 text-lg text-gray-600">
        Software Engineer
      </p>

      <nav className="mt-6 flex gap-4">
        <Link href="/resume" className="text-blue-600 hover:underline">
          Resume
        </Link>
      </nav>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold">About Me</h2>
        {/* TODO: Fill in your about me content */}
        <p className="mt-4 text-gray-500 italic">Coming soon...</p>
      </section>
    </div>
  );
}
