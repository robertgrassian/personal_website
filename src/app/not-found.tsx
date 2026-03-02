import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-sm text-muted uppercase tracking-widest font-semibold">404</p>
      <h1 className="mt-2 text-4xl font-bold">Level not found</h1>
      <p className="mt-3 text-lg text-muted">
        This page doesn&apos;t exist or may have moved. Let&apos;s get you back on track.
      </p>
      <Link href="/" className="mt-6 inline-block text-link hover:underline">
        Back to home
      </Link>
    </div>
  );
}
