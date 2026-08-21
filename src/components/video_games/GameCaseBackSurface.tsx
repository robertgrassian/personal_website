import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

// The back-of-case look, as a background for whatever is laid on it:
// dominant-color base → blurred cover art → dark overlay → content.
// The blurred cover gives a physical, textured feel (like real box art
// wrapping around to the back) while the overlay keeps text readable.
//
// The overlay is dark in both color schemes, so content on it uses fixed light
// text rather than the shelf tokens. Anything that wants the shelf tokens
// (every form control) has to bring its own solid surface.
type GameCaseBackSurfaceProps = {
  imageUrl: string;
  // Console color fallback, applied only when there is no extracted color:
  // the [data-system] rule out-specifies the inherited --system-fallback and
  // would beat it.
  system: string;
  dominantColor: string | null;
  // Rendered width, for Next's image optimizer.
  sizes: string;
  className?: string;
  children: ReactNode;
};

export function GameCaseBackSurface({
  imageUrl,
  system,
  dominantColor,
  sizes,
  className = "",
  children,
}: GameCaseBackSurfaceProps) {
  const hasImage = imageUrl !== "";

  return (
    <div
      className={`game-case-back-surface relative overflow-hidden ${className}`}
      data-system={dominantColor ? undefined : system}
      style={dominantColor ? ({ "--system-fallback": dominantColor } as CSSProperties) : undefined}
    >
      {hasImage && (
        <Image
          src={imageUrl}
          alt=""
          fill
          aria-hidden
          className="object-cover"
          sizes={sizes}
          // blur and opacity come from --back-blur / --back-img-opacity on
          // .game-case-back-surface, so they can be tuned live in DevTools.
          // scale(-1.1, 1.1) mirrors it horizontally so the visual weight is
          // not a copy of the front, and overscales 10% so the blur does not
          // pull transparent edges into frame.
          style={{
            transform: "scale(-1.1, 1.1)",
            filter: "blur(var(--back-blur))",
            opacity: "var(--back-img-opacity)",
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgb(0 0 0 / var(--back-overlay))` }}
      />

      {children}
    </div>
  );
}
