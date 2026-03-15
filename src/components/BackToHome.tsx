import Link from "next/link";

export function BackToHome() {
  return (
    <Link href="/" className="text-link hover:text-link-hover hover:underline">
      &larr; Home
    </Link>
  );
}
