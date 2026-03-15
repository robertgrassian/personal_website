import Link from "next/link";

type BackToHomeProps = {
  // Optional className so pages with different backgrounds can style the link color.
  className?: string;
};

export function BackToHome({ className = "text-link" }: BackToHomeProps) {
  return (
    <Link href="/" className={`${className} hover:text-link-hover hover:underline`}>
      &larr; Home
    </Link>
  );
}
