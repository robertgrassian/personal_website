// Preview at: /video-games/opengraph-image
// Dynamically generated OG image for the Game Library page.
// Title section on a dark background, featured games in one bay of the
// built-in bookcase, drawn from the same baked grain tiles the shelf wears.
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";
import { getGames } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";
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

// The shelf-themes.css built-in measurements, scaled from its 96px cover to
// this one so the case keeps the shelf's proportions at share-card size.
const COVER_W = 136;
const COVER_H = 181; // ~3:4, matching IGDB's t_cover_big
const K = COVER_W / 96;
const px = (n: number) => Math.round(n * K);

const GAP = px(12); // --shelf-gap
const STILE_W = px(25); // --shelf-stile-w
const ROW_TOP = px(18); // --shelf-row-top
const CROWN_H = px(17);
const PLINTH_H = px(19);
const FLOOR_H = px(7); // --shelf-floor
// The real case leaves air between the end covers and the uprights.
const ROW_AIR = 14;
const BAY_W = FEATURED_GAMES.length * COVER_W + (FEATURED_GAMES.length - 1) * GAP + 2 * ROW_AIR;
const BAY_H = ROW_TOP + COVER_H;
const INSET = Math.round(BAY_W * 0.014); // --shelf-inset

// Satori cannot decode WebP, so `npm run grain` writes PNG copies of each
// tile beside the ones the shelf uses. Read from disk for the same reason as
// the root OG image: there is no server to resolve a /public URL at build time.
function grainTile(name: "grain-h" | "grain-v" | "grain-back"): string {
  const buffer = fs.readFileSync(path.join(process.cwd(), `public/shelf/og/${name}.png`));
  return `url(data:image/png;base64,${buffer.toString("base64")})`;
}

// The size for every gradient layer. Satori draws nothing for a gradient
// sized `auto`, the CSS default, so a size list must never use it.
const FILL = "100% 100%";

// --shelf-band-h / --shelf-band-v: broad lighting across a piece.
const BAND_STOPS =
  "transparent 4%, rgba(255, 205, 145, 0.09) 22%, transparent 40%, rgba(0, 0, 0, 0.13) 58%, transparent 76%, rgba(255, 205, 145, 0.09) 92%";
const BAND_H = `linear-gradient(0deg, ${BAND_STOPS})`;
const BAND_V = `linear-gradient(90deg, ${BAND_STOPS})`;

export default async function OGImage() {
  // The OG image for /video-games specifically, so the owner is pinned.
  // /video-games/u/[username] has no OG image of its own yet.
  const games = await getGames(LIBRARY_OWNER_USERNAME);
  const totalCount = games.length;
  // Build a name→game map for fast lookup, then pull featured games in order.
  const byName = new Map(games.map((g) => [g.name, g]));
  const coverGames = FEATURED_GAMES.map((name) => byName.get(name)).filter(
    (g) => g?.imageUrl
  ) as (typeof games)[number][];

  const grainH = grainTile("grain-h");
  const grainV = grainTile("grain-v");
  const grainBack = grainTile("grain-back");
  // Each tile at its CSS size (512x56, 56x512, 384x512), scaled like the rest.
  const sizeH = `${FILL}, ${px(512)}px ${px(56)}px, ${FILL}`;
  const sizeV = `${FILL}, ${px(56)}px ${px(512)}px, ${FILL}`;

  // Crown and plinth: the horizontal-grain boards above and below the bay.
  const board = (height: number) => ({
    height,
    display: "flex",
    backgroundColor: OG.shelfWood,
    backgroundImage: `${OG.shelfShade}, ${grainH}, ${BAND_H}`,
    backgroundSize: sizeH,
  });
  const stile = (side: "left" | "right") => ({
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    [side]: 0,
    width: STILE_W,
    backgroundColor: OG.shelfWoodLit,
    backgroundImage: `${OG.shelfShade}, ${grainV}, ${BAND_V}`,
    backgroundSize: sizeV,
    boxShadow:
      side === "left"
        ? "inset -3px 0 6px -3px rgba(0, 0, 0, 0.55)"
        : "inset 3px 0 6px -3px rgba(0, 0, 0, 0.55)",
  });
  // The bay's side walls: trapezoids from the opening back to the inset panel.
  const wall = (side: "left" | "right") => ({
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    [side]: STILE_W,
    width: INSET,
    backgroundColor: OG.shelfWood,
    backgroundImage: `${OG.shelfShade}, linear-gradient(${side === "left" ? 90 : 270}deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.66)), ${grainV}`,
    backgroundSize: `${FILL}, ${FILL}, ${px(56)}px ${px(512)}px`,
    clipPath:
      side === "left"
        ? `polygon(0 0, 0 100%, 100% calc(100% - ${FLOOR_H}px), 100% 0)`
        : `polygon(100% 0, 100% 100%, 0 calc(100% - ${FLOOR_H}px), 0 0)`,
  });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: OG.shelfBg,
        // --shelf-room-light (dark)
        backgroundImage:
          "radial-gradient(110% 55% at 50% -8%, rgba(255, 222, 176, 0.045) 0%, rgba(255, 222, 176, 0) 62%)",
      }}
    >
      {/* ── Title — fills all space above the case ── */}
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

      {/* ── The case: crown, one bay, plinth. Satori has no z-index, so paint
          order is document order, which is what decides the stacking below. ── */}
      <div
        style={{
          width: BAY_W + 2 * STILE_W,
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG.shelfCarcass,
          boxShadow: "0 24px 46px -20px rgba(0, 0, 0, 0.75)",
        }}
      >
        <div
          style={{
            ...board(CROWN_H),
            boxShadow: "inset 0 1px 0 rgba(255, 240, 215, 0.22), 0 4px 9px rgba(0, 0, 0, 0.4)",
          }}
        />

        <div
          style={{
            position: "relative",
            height: BAY_H,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: GAP,
          }}
        >
          {/* Back panel: the same timber in the shadow of the crown, with a
              little bounce off the floor at the bottom. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: FLOOR_H,
              left: STILE_W + INSET,
              right: STILE_W + INSET,
              backgroundColor: OG.shelfWood,
              backgroundImage: `${OG.shelfShade}, linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.56) 34%, rgba(0, 0, 0, 0.47) 100%), linear-gradient(0deg, rgba(255, 240, 220, 0.07) 0%, rgba(255, 240, 220, 0) 22%), ${grainBack}`,
              backgroundSize: `${FILL}, ${FILL}, ${FILL}, ${px(384)}px ${px(512)}px`,
            }}
          />
          <div style={wall("left")} />
          <div style={wall("right")} />
          {/* The visible strip of shelf floor in front of the back panel. */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: STILE_W,
              right: STILE_W,
              height: FLOOR_H,
              backgroundColor: OG.shelfWood,
              backgroundImage: `${OG.shelfShade}, linear-gradient(180deg, rgba(0, 0, 0, 0.52), rgba(255, 240, 215, 0.1)), ${grainH}`,
              backgroundSize: `${FILL}, ${FILL}, ${px(512)}px ${px(56)}px`,
              clipPath: `polygon(0 100%, 100% 100%, calc(100% - ${INSET}px) 0, ${INSET}px 0)`,
            }}
          />
          <div style={stile("left")} />
          <div style={stile("right")} />

          {coverGames.map((game) => (
            <img
              key={game.name}
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

        <div
          style={{
            ...board(PLINTH_H),
            position: "relative",
            justifyContent: "center",
            gap: GAP,
            boxShadow: "inset 0 1px 0 rgba(0, 0, 0, 0.4), inset 0 -1px 0 rgba(255, 240, 215, 0.12)",
          }}
        >
          {/* Each cover's contact shadow falls onto the plinth it stands on,
              so it is drawn here, after the plinth's own paint. */}
          {coverGames.map((game) => (
            <div
              key={game.name}
              style={{
                width: COVER_W + 6,
                height: px(8),
                margin: "0 -3px",
                backgroundImage:
                  "radial-gradient(ellipse at 50% 0%, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0) 72%)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom gap — raises the case off the edge of the image ── */}
      <div style={{ height: 44, display: "flex" }} />
    </div>,
    { ...size }
  );
}
