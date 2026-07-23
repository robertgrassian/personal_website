"use client";

import { RATINGS, type Rating } from "@/lib/games";

type RatingEditorProps = {
  current: Rating | "";
  onRate: (rating: Rating | "") => void;
};

// Compact owner-only rating strip for the game case's back face: one button
// per rating letter; clicking the active letter clears the rating. Sits
// inside the card's flip surface, so both handlers stop propagation — a
// click or Enter keypress on a rating must not also flip the card.
export function RatingEditor({ current, onRate }: RatingEditorProps) {
  return (
    <div
      className="flex gap-1 justify-between"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {RATINGS.map((r) => {
        const active = r.name === current;
        return (
          <button
            key={r.letter}
            type="button"
            aria-pressed={active}
            title={active ? "Remove rating" : `Rate ${r.name}`}
            onClick={() => onRate(active ? "" : r.name)}
            // The back face is a dark surface in both color schemes, and the
            // rating color vars adapt per scheme — so no dark: variants needed.
            className={`h-5 w-4 rounded-sm text-[10px] font-bold leading-none cursor-pointer
                        transition-transform hover:scale-110
                        ${active ? "text-black/80" : "text-white/90 bg-white/10 hover:bg-white/20"}`}
            style={active ? { backgroundColor: r.color } : undefined}
          >
            {r.letter}
          </button>
        );
      })}
    </div>
  );
}
