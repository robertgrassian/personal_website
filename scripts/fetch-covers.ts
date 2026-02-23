/**
 * scripts/fetch-covers.ts
 *
 * Fetches game cover art URLs from IGDB and writes them into games.csv.
 * Reads cover-overrides.json first — overrides take priority over IGDB auto-search
 * and will re-fetch even if a URL already exists in the CSV.
 *
 * Run this whenever you want to refresh cover art (e.g. after adding new games,
 * or after adding entries to cover-overrides.json to fix wrong/missing covers).
 *
 * Setup:
 *   1. Go to https://dev.twitch.tv/console → "Register Your Application"
 *   2. Click "Manage" → copy your Client ID and Client Secret
 *   3. Run:
 *        CLIENT_ID=your_id CLIENT_SECRET=your_secret npx tsx scripts/fetch-covers.ts
 *
 * cover-overrides.json value format:
 *   "Game CSV Name": "IGDB search term"   → re-fetches using this title instead
 *   "Game CSV Name": "https://..."         → uses this URL directly, no IGDB call
 *   "Game CSV Name": ""                    → no cover art; use in-app fallback
 */

import fs from "fs";
import path from "path";

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "❌  Missing env vars. Run with: CLIENT_ID=xxx CLIENT_SECRET=xxx npx tsx scripts/fetch-covers.ts"
  );
  process.exit(1);
}

// --- Load cover-overrides.json ---
// Keys starting with "_" are treated as comments and ignored.
const overridesPath = path.join(process.cwd(), "scripts/cover-overrides.json");
const overrides: Record<string, string> = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(overridesPath, "utf-8")) as Record<string, string>)
    // Filter out "_comment" and other metadata keys
    .filter(([key]) => !key.startsWith("_"))
);
console.log(`Loaded ${Object.keys(overrides).length} overrides from cover-overrides.json\n`);

// --- IGDB Auth ---
// IGDB uses Twitch OAuth for authentication.
// "client_credentials" gives us an app-level token (no user login needed).
async function getAccessToken(): Promise<string> {
  const resp = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!resp.ok) {
    throw new Error(`Twitch auth failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

// --- IGDB Cover Fetch ---
// Uses Apicalypse query language. `where cover != null` ensures we only
// get games that actually have cover art, avoiding irrelevant first results.
async function fetchCoverUrl(token: string, searchTerm: string): Promise<string> {
  const escaped = searchTerm.replace(/"/g, '\\"');
  const body = `
    search "${escaped}";
    fields name, cover.url;
    where cover != null;
    limit 1;
  `;

  const resp = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  if (!resp.ok) {
    console.warn(`  [http-error] ${resp.status} ${resp.statusText} for "${searchTerm}"`);
    return "";
  }
  const results = (await resp.json()) as Array<{ name?: string; cover?: { url: string } }>;
  const rawUrl = results[0]?.cover?.url;
  if (!rawUrl) return "";

  // IGDB returns thumbnail URLs like: //images.igdb.com/igdb/image/upload/t_thumb/abc123.jpg
  // Upgrade to "t_cover_big" (264×374px) for display quality.
  return rawUrl.replace("t_thumb", "t_cover_big").replace("//", "https://");
}

// --- Main ---
async function main() {
  const csvPath = path.join(process.cwd(), "games.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");
  const [header, ...rows] = lines;

  const token = await getAccessToken();
  console.log("✓  Got IGDB access token\n");

  const updatedRows: string[] = [];

  for (const row of rows) {
    if (!row.trim()) continue;

    const parts = row.split(",");
    const name = parts[0]?.trim() ?? "";
    const override = overrides[name]; // undefined if not in overrides.json

    // --- Branch 1: Override exists ---
    // Overrides always win — they re-process the game even if the CSV already has a URL.
    if (override !== undefined) {
      if (override.startsWith("https://")) {
        // Direct URL — use it verbatim, no IGDB call needed.
        console.log(`  [override-url]    ${name}`);
        parts[6] = override;
      } else if (override === "") {
        // Explicitly no cover art — use app fallback.
        console.log(`  [override-none]   ${name}`);
        parts[6] = "";
      } else {
        // Use the override value as the IGDB search term (better official title).
        const imageUrl = await fetchCoverUrl(token, override);
        console.log(
          `  ${imageUrl ? "[override-ok]  " : "[override-miss]"} ${name}  →  "${override}"`
        );
        parts[6] = imageUrl;
        await new Promise((res) => setTimeout(res, 300));
      }
      updatedRows.push(parts.join(","));
      continue;
    }

    // --- Branch 2: No override, already has a URL ---
    // Skip — only re-process via an explicit override entry.
    if (parts[6]?.trim()) {
      console.log(`  [skip]            ${name}`);
      updatedRows.push(row);
      continue;
    }

    // --- Branch 3: No override, no URL ---
    // Normal IGDB search using the CSV name.
    const imageUrl = await fetchCoverUrl(token, name);
    console.log(`  ${imageUrl ? "[ok]   " : "[miss] "}           ${name}`);
    parts[6] = imageUrl;
    updatedRows.push(parts.join(","));
    await new Promise((res) => setTimeout(res, 300));
  }

  const finalHeader = header.includes("image_url") ? header : `${header},image_url`;
  const output = [finalHeader, ...updatedRows].join("\n") + "\n";
  fs.writeFileSync(csvPath, output, "utf-8");
  console.log(`\n✓  Done! Processed ${updatedRows.length} rows.`);
}

main().catch(console.error);
