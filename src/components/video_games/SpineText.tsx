"use client";

// Renders the game name vertically on the spine, scaling down uniformly
// so long titles shrink to fit rather than clipping.

import { useState, useRef, useLayoutEffect } from "react";

type SpineTextProps = {
  name: string;
  darkBackground?: boolean;
};

export function SpineText({ name, darkBackground = true }: SpineTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  // useLayoutEffect measures before paint so there's no flash of oversized text.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (container && text) {
      // With writing-mode: vertical-rl, scrollHeight is the vertical extent of the text.
      const available = container.clientHeight;
      const needed = text.scrollHeight;
      setScale(needed > available ? available / needed : 1);
    }
  }, [name]);

  return (
    // Outer div applies the margin; inner div is measured for available space.
    <div className="h-full w-full py-1.5">
      <div ref={containerRef} className="h-full flex items-center justify-center">
        <span
          ref={textRef}
          // Light text on dark spines, dark text on light spines — driven by
          // fast-average-color's luminance detection of the cover art.
          className={`text-[9px] font-semibold whitespace-nowrap tracking-tight ${darkBackground ? "text-gray-300" : "text-gray-950"}`}
          style={{ writingMode: "vertical-rl", transform: `scale(${scale})` }}
        >
          {name}
        </span>
      </div>
    </div>
  );
}
