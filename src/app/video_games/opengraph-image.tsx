// Preview at: /video_games/opengraph-image
// Dynamically generated OG image for the Game Library page.
// Title section on a dark background, game cases sitting on a walnut shelf plank.
import { ImageResponse } from "next/og";
import { getGames } from "@/lib/gamesServer";
import { OG } from "@/lib/og-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Specific games to feature on the shelf, in display order.
const FEATURED_GAMES = [
  "The Legend of Zelda: Breath of the Wild",
  "Baldur's Gate 3",
  "Elden Ring",
  "Hades 2",
  "Stardew Valley",
  "Super Smash Bros Ultimate",
  "Starfox Adventures",
];
const COVER_W = 158;
const COVER_H = 210; // ~3:4 ratio, matching IGDB's t_cover_big format
const COVER_GAP = 8;
const PADDING_X = 23;

// How much plank is visible above the tops of the cases — matches the feel
// of the actual game library shelf where a strip of wood shows above the covers.
const PLANK_OVERHANG = 24;

// Grain background for the plank, ported from .shelf-plank-grain in video_games.css.
// CSS variables resolved to their dark-mode values.
const PLANK_BACKGROUND = [
  // Fine grain rhythm 1 — tight 9px repeat
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, transparent 1px, transparent 2px, rgba(255,255,255,0.03) 3px, transparent 4px, transparent 9px)",
  // Fine grain rhythm 2 — wider 15px repeat
  "repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, transparent 1px, transparent 5px, rgba(0,0,0,0.08) 6px, transparent 7px, transparent 15px)",
  // Broad warm and dark bands across the width
  "linear-gradient(90deg, transparent 0%, rgba(255,180,80,0.04) 10%, transparent 20%, rgba(0,0,0,0.06) 35%, transparent 45%, rgba(255,180,80,0.03) 60%, transparent 70%, rgba(0,0,0,0.07) 85%, transparent 100%)",
  // Large knot hint
  "radial-gradient(ellipse 60px 30px at 25% 60%, rgba(0,0,0,0.08) 0%, transparent 70%)",
  // Small knot hint
  "radial-gradient(ellipse 40px 20px at 72% 35%, rgba(0,0,0,0.06) 0%, transparent 70%)",
  // Base color — solid gradient as the bottommost layer (multi-layer backgrounds
  // don't support a plain color value)
  `linear-gradient(${OG.shelfPlank}, ${OG.shelfPlank})`,
].join(", ");

export default function OGImage() {
  const games = getGames();
  const totalCount = games.length;
  // Build a name→game map for fast lookup, then pull featured games in order.
  const byName = new Map(games.map((g) => [g.name, g]));
  const coverGames = FEATURED_GAMES.map((name) => byName.get(name)).filter(
    (g) => g?.imageUrl
  ) as (typeof games)[number][];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.shelfBg,
      }}
    >
      {/* ── Title — fills all space above the shelf ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: OG.textPrimary,
            letterSpacing: "-1.5px",
            lineHeight: 1,
          }}
        >
          Game Library
        </div>

        <div
          style={{
            width: 64,
            height: 4,
            borderRadius: 2,
            background: OG.accent,
          }}
        />

        <div
          style={{
            fontSize: 30,
            color: OG.textMuted,
            letterSpacing: "0.02em",
          }}
        >
          {`${totalCount} games played`}
        </div>
      </div>

      {/* ── Shelf plank — grain texture, taller than the cases so a strip of
          wood is visible above them, same as the real game library shelf ── */}
      <div
        style={{
          height: COVER_H + PLANK_OVERHANG,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: PLANK_BACKGROUND,
          boxShadow: "inset 0 2px 4px rgba(255,255,255,0.04), inset 0 -2px 6px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            paddingLeft: PADDING_X,
            paddingRight: PADDING_X,
            gap: COVER_GAP,
          }}
        >
          {coverGames.map((game, i) => (
            <img
              key={i}
              alt=""
              src={game.imageUrl}
              style={{
                width: COVER_W,
                height: COVER_H,
                objectFit: "cover",
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Front edge / lip ── */}
      <div
        style={{
          height: 7,
          background: `linear-gradient(to bottom, ${OG.shelfEdge} 0%, ${OG.shelfEdgeBottom} 100%)`,
        }}
      />

      {/* ── Bottom gap — raises the shelf off the edge of the image ── */}
      <div style={{ height: 48, display: "flex" }} />
    </div>,
    { ...size }
  );
}
