// Preview at: /opengraph-image
// This file is picked up automatically by Next.js as the OG image for the root route.
//
// Two visual variants are defined below. Change VARIANT to switch between them:
//   "A" — San Pedro cliffs photo (full-bleed, dark overlay — matches homepage aesthetic)
//   "B" — Warm gradient (dark charcoal base, amber radial glow in the lower-right corner)

import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";
import { OG } from "@/lib/og-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VARIANT: "A" | "B" = "A";

// Fetches the Caveat Bold font binary from Google Fonts.
// ImageResponse (Satori under the hood) can't use CSS or next/font — fonts must be
// loaded as ArrayBuffer and passed explicitly via the `fonts` option.
// We request with an older user-agent so Google returns a WOFF URL (not WOFF2),
// which Satori handles most reliably.
async function loadCaveatFont(): Promise<ArrayBuffer> {
  const css = await fetch("https://fonts.googleapis.com/css2?family=Caveat:wght@700", {
    headers: { "User-Agent": "Mozilla/4.0" },
  }).then((r) => r.text());

  // The CSS has multiple @font-face blocks (one per unicode range).
  // The last url() is the latin subset, which covers "my site".
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  const url = urls[urls.length - 1];
  if (!url) throw new Error("Could not parse Caveat font URL from Google Fonts CSS");

  return fetch(url).then((r) => r.arrayBuffer());
}

// Reads the local photo and returns a base64 data URL.
// ImageResponse runs server-side, so fs is available — but we can't use a relative
// /public URL (there's no HTTP server to resolve it at build time).
function getPhotoDataUrl(): string {
  const imgPath = path.join(process.cwd(), "public/images/san-pedro-cliffs.jpeg");
  const buffer = fs.readFileSync(imgPath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

export default async function OGImage() {
  const caveatFont = await loadCaveatFont();

  // getPhotoDataUrl() reads from disk — only call it when Variant A is active.
  const jsx = VARIANT === "A" ? <VariantA photoSrc={getPhotoDataUrl()} /> : <VariantB />;

  return new ImageResponse(jsx, {
    ...size,
    fonts: [{ name: "Caveat", data: caveatFont, weight: 700, style: "normal" }],
  });
}

// ─── Shared text content ──────────────────────────────────────────────────────
// Rendered centered over whatever background each variant provides.
// Uses position:absolute + inset so it layers on top of both photo and gradient.
function TextContent({ showTagline }: { showTagline: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: 88,
          fontWeight: 700,
          color: OG.textPrimary,
          letterSpacing: "-2px",
          lineHeight: 1,
        }}
      >
        Robert Grassian
      </div>

      {/* Caveat is a casual handwriting font — the slight rotation adds a hand-written feel */}
      {showTagline && (
        <div
          style={{
            fontSize: 52,
            color: OG.accent,
            fontFamily: "Caveat",
            marginTop: 20,
            transform: "rotate(-1.5deg)",
          }}
        >
          my site
        </div>
      )}
    </div>
  );
}

// ─── San Pedro cliffs photo ──────────────────────────────────────────────────
function VariantA({ photoSrc }: { photoSrc: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
      {/* Full-bleed photo — position:absolute fills the positioned parent */}
      <img
        alt=""
        src={photoSrc}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Dark gradient overlay — mirrors the homepage gradient so the OG image
          feels like a still frame of the site */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <TextContent showTagline={false} />
    </div>
  );
}

// ─── Option B: Warm amber gradient ───────────────────────────────────────────
function VariantB() {
  // OG.accent is #b45309 = rgb(180, 83, 9) — used as the glow color so the
  // background warmth matches the text accent exactly.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        // Glow center is pushed just below the image (110%) so the light
        // appears to rise up from beneath rather than sit in a corner.
        background:
          "radial-gradient(ellipse 110% 80% at 50% 110%, rgba(180, 83, 9, 0.55) 0%, transparent 60%), " +
          "linear-gradient(180deg, #0f172a 0%, #0c0a08 100%)",
      }}
    >
      <TextContent showTagline={true} />
    </div>
  );
}
