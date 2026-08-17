// A single line of text that crawls there and back when it is too wide for its
// container, and sits still (clipped with an ellipsis) when it fits.
//
// Used for the CRT's system + genres line, which is deliberately height-locked
// to one line (see the height-stability comment in CrtTv.tsx) and so used to end
// in an unreadable ellipsis on a phone.
//
// Why this is hand-rolled rather than imported: the popular React marquee
// packages (react-fast-marquee, react-marquee-text) all implement the news
// ticker instead — clone the content and loop it forever, unconditionally, with
// no overflow test and no pause. Text that already fits would scroll anyway.
// The measuring below is the part that was actually needed, and it is the part
// none of them do.
//
// Client Component: measuring laid-out boxes needs the DOM.
"use client";

import { useEffect, useRef, useState } from "react";

// Crawl speed. Slow enough to read, and quick enough that a typical line
// finishes a there-and-back cycle inside CrtTv's CHANNEL_INTERVAL_MS; an
// unusually long one is simply cut off by the channel change.
const SPEED_PX_PER_SEC = 40;
// How long the text rests at each end of its travel, and before the first move.
const END_PAUSE_MS = 1000;

type MarqueeTextProps = {
  // A string rather than children: the effect below re-measures when the text
  // changes, which needs a value that compares by equality across renders.
  text: string;
  className?: string;
};

export function MarqueeText({ text, className }: MarqueeTextProps) {
  const viewportRef = useRef<HTMLParagraphElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  // Pixels of overflow to travel. 0 means the text fits, so nothing animates.
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    let cancelled = false;

    function measure() {
      if (cancelled || !viewport || !track) return;
      // scrollWidth reports the full content width even while it is clipped, so
      // this reads correctly in both states: the track spans the viewport when
      // idle and is content-width once scrolling.
      const overflow = track.scrollWidth - viewport.clientWidth;
      // Sub-pixel rounding can leave a fraction of overflow on text that fits.
      setDistance(overflow > 1 ? overflow : 0);
    }

    measure();

    // Two boxes, because each state changes size differently: rotating the phone
    // or crossing a breakpoint resizes the viewport, while a text swap resizes
    // the track only once it is content-width.
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    // Web fonts (next/font/google) land after first paint, and the new metrics
    // resize neither box while the track is still viewport-width.
    void document.fonts.ready.then(measure);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text]);

  const isScrolling = distance > 0;

  // The keyframes hold nothing back on their own: the rests at each end come
  // from a linear() timing function, since keyframe offsets cannot read a
  // custom property and the rests must stay a fixed duration rather than a
  // share of a length-dependent one.
  const durationMs = Math.round((distance / SPEED_PX_PER_SEC) * 1000) + END_PAUSE_MS;
  // Half the pause per side, because `alternate` puts the tail of one pass and
  // the head of the next back to back at each turn. Kept to a decimal place so
  // an unusually long line does not round its hold away to 0%.
  const holdPct = Math.round(((END_PAUSE_MS / 2 / durationMs) * 100 + Number.EPSILON) * 10) / 10;

  const scrollStyle = {
    "--pcrt-marquee-distance": `${distance}px`,
    "--pcrt-marquee-duration": `${durationMs}ms`,
    // Delays only the first pass, so the opening rest matches the turns.
    "--pcrt-marquee-delay": `${END_PAUSE_MS / 2}ms`,
    "--pcrt-marquee-ease": `linear(0 0%, 0 ${holdPct}%, 1 ${100 - holdPct}%, 1 100%)`,
  } as React.CSSProperties;

  return (
    <p ref={viewportRef} className={`pcrt-marquee${className ? ` ${className}` : ""}`}>
      <span
        ref={trackRef}
        className={`pcrt-marquee-track${isScrolling ? " is-scrolling" : ""}`}
        style={isScrolling ? scrollStyle : undefined}
      >
        {text}
      </span>
    </p>
  );
}
