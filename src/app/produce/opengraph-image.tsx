// Preview at: /produce/opengraph-image
// The share card for /produce and every state page under it: kraft paper, the heading, and four
// seed packets. Drawn directly because Satori renders without a browser, so produce.css and its
// var() tokens are not available; the hexes below are copied from its light scheme.
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";
import { ACCENTS, ACTIVE_ACCENT } from "@/lib/accent";
import { produceBySlug } from "@/lib/produce/catalog";
import { northeast } from "@/lib/produce/regions/northeast";
import { statusIn } from "@/lib/produce/season";
import { categoryGlyphs, roughRect, underline } from "@/lib/produce/sketch";
import type { ProduceCategory } from "@/lib/produce/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "What's in season: fruit, vegetables and herbs, month by month";

// From produce.css, light scheme.
const PAPER = "#d9c39d";
const INK = "#2b2117";
const INK_SOFT = "#5b4934";
const PACKET = "#f3e9d2";
const SHADOW = "rgba(74, 52, 26, 0.18)";
const TINT: Record<ProduceCategory, string> = {
  fruit: "#eab7a3",
  vegetable: "#c3d6a0",
  herb: "#aed2c3",
  mushroom: "#d6c09c",
};

const PACKETS = ["strawberry", "ramps", "basil", "apple"];
const TILTS = [-2.5, 1.8, 1.2, -1.6];
const PACKET_W = 220;
const PACKET_H = 262;

function loadCaveat(): ArrayBuffer {
  const buffer = fs.readFileSync(path.join(process.cwd(), "public/fonts/Caveat-Bold.ttf"));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export default async function OGImage() {
  const glyphs = categoryGlyphs();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "0 72px",
        fontFamily: "Caveat",
        color: INK,
        backgroundColor: PAPER,
        backgroundImage:
          "radial-gradient(ellipse at 10% 0%, rgba(255,255,255,0.3), transparent 60%), radial-gradient(ellipse at 95% 90%, rgba(92,60,24,0.16), transparent 55%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 112, lineHeight: 1 }}>What&apos;s in season</div>
          <svg width="460" height="24" viewBox="0 0 200 10" style={{ marginTop: 6 }}>
            <path
              d={underline()}
              fill="none"
              stroke={ACCENTS[ACTIVE_ACCENT].light}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div style={{ fontSize: 44, color: INK_SOFT, marginTop: 28, lineHeight: 1.15 }}>
          Fruit, vegetables and herbs, month by month, where you live.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: 2 * PACKET_W + 48,
          gap: 32,
          marginLeft: "auto",
        }}
      >
        {PACKETS.map((slug, i) => {
          const item = produceBySlug(slug);
          const season = northeast.seasons[slug];
          if (!item || !season) return null;
          return (
            <div
              key={slug}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                width: PACKET_W,
                height: PACKET_H,
                padding: "16px 18px",
                backgroundColor: PACKET,
                boxShadow: `4px 5px 0 ${SHADOW}`,
                transform: `rotate(${TILTS[i]}deg)`,
              }}
            >
              <svg
                width={PACKET_W}
                height={PACKET_H}
                style={{ position: "absolute", top: 0, left: 0 }}
              >
                <path
                  d={roughRect(PACKET_W, PACKET_H, 11 + i * 12)}
                  fill="none"
                  stroke={INK}
                  strokeWidth={2}
                />
              </svg>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 120,
                  backgroundColor: TINT[item.category],
                }}
              >
                <svg width="64" height="64" viewBox="0 0 24 24">
                  <path
                    d={glyphs[item.category]}
                    fill="none"
                    stroke={INK}
                    strokeWidth={1.1}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div style={{ fontSize: 40, marginTop: 10, lineHeight: 1 }}>{item.name}</div>
              <div style={{ display: "flex", gap: 3, marginTop: "auto" }}>
                {Array.from({ length: 12 }, (_, m) => {
                  const status = statusIn(season, m);
                  return (
                    <div
                      key={m}
                      style={{
                        width: 12,
                        height: 10,
                        border: `1.5px solid ${status === "out" ? "rgba(43,33,23,0.25)" : INK}`,
                        backgroundColor:
                          status === "peak"
                            ? INK
                            : status === "available"
                              ? "rgba(43,33,23,0.3)"
                              : "transparent",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Caveat", data: loadCaveat(), weight: 700, style: "normal" }],
    }
  );
}
