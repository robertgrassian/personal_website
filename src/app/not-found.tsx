import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-lg text-muted">Page not found.</p>
      <Link href="/" className="mt-6 inline-block text-link hover:underline">
        Back to home
      </Link>
    </div>
  );
}
