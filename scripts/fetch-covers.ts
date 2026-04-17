/**
 * scripts/fetch-covers.ts
 *
 * Fetches game cover art URLs from IGDB and writes them into a CSV file.
 * Reads cover-overrides.json first — overrides take priority over IGDB auto-search
 * and will re-fetch even if a URL already exists in the CSV.
 *
 * Run this whenever you want to refresh cover art (e.g. after adding new games,
 * or after adding entries to cover-overrides.json to fix wrong/missing covers).
 *
 * Setup:
 *   1. Go to https://dev.twitch.tv/console → "Register Your Application"
 *   2. Click "Manage" → copy your Client ID and Client Secret
 *   3. Run (CSV path optional, defaults to games.csv):
 *        CLIENT_ID=xxx CLIENT_SECRET=xxx npx tsx scripts/fetch-covers.ts [csv-path]
 *        CLIENT_ID=xxx CLIENT_SECRET=xxx npx tsx scripts/fetch-covers.ts wishlist.csv
 *
 * The target CSV must have a "name" column (used as the IGDB search term) and
 * an "image_url" column (where results are written). Other columns are preserved
 * in place; column order is inferred from the header, not hardcoded.
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
  // First positional CLI arg overrides the default CSV path. This lets us point
  // the same script at games.csv or wishlist.csv without duplicating logic.
  const csvArg = process.argv[2] ?? "games.csv";
  const csvPath = path.join(process.cwd(), csvArg);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");
  const [header, ...rows] = lines;

  // Find the image_url column by header name, not a hardcoded index. games.csv
  // has it at position 6 but wishlist.csv puts it at position 4 — the script
  // must adapt to whatever schema the target CSV uses.
  const headerCols = header.split(",").map((c) => c.trim());
  const nameCol = headerCols.indexOf("name");
  let imageUrlCol = headerCols.indexOf("image_url");
  if (nameCol === -1) {
    throw new Error(`CSV ${csvArg} has no "name" column — cannot look up games`);
  }

  // If image_url is missing, we'll append it. New column index = current length.
  const finalHeader = imageUrlCol === -1 ? `${header},image_url` : header;
  if (imageUrlCol === -1) imageUrlCol = headerCols.length;

  const token = await getAccessToken();
  console.log(`✓  Got IGDB access token (target: ${csvArg})\n`);

  const updatedRows: string[] = [];

  for (const row of rows) {
    if (!row.trim()) continue;

    const parts = row.split(",");
    // Pad with empty strings if the row is shorter than the header (e.g. no image_url yet).
    while (parts.length <= imageUrlCol) parts.push("");

    const name = parts[nameCol]?.trim() ?? "";
    const override = overrides[name]; // undefined if not in overrides.json

    // --- Branch 1: Override exists ---
    // Overrides always win — they re-process the game even if the CSV already has a URL.
    if (override !== undefined) {
      if (override.startsWith("https://")) {
        // Direct URL — use it verbatim, no IGDB call needed.
        console.log(`  [override-url]    ${name}`);
        parts[imageUrlCol] = override;
      } else if (override === "") {
        // Explicitly no cover art — use app fallback.
        console.log(`  [override-none]   ${name}`);
        parts[imageUrlCol] = "";
      } else {
        // Use the override value as the IGDB search term (better official title).
        const imageUrl = await fetchCoverUrl(token, override);
        console.log(
          `  ${imageUrl ? "[override-ok]  " : "[override-miss]"} ${name}  →  "${override}"`
        );
        parts[imageUrlCol] = imageUrl;
        await new Promise((res) => setTimeout(res, 300));
      }
      updatedRows.push(parts.join(","));
      continue;
    }

    // --- Branch 2: No override, already has a URL ---
    // Skip — only re-process via an explicit override entry.
    if (parts[imageUrlCol]?.trim()) {
      console.log(`  [skip]            ${name}`);
      updatedRows.push(parts.join(","));
      continue;
    }

    // --- Branch 3: No override, no URL ---
    // Normal IGDB search using the CSV name.
    const imageUrl = await fetchCoverUrl(token, name);
    console.log(`  ${imageUrl ? "[ok]   " : "[miss] "}           ${name}`);
    parts[imageUrlCol] = imageUrl;
    updatedRows.push(parts.join(","));
    await new Promise((res) => setTimeout(res, 300));
  }

  const output = [finalHeader, ...updatedRows].join("\n") + "\n";
  fs.writeFileSync(csvPath, output, "utf-8");
  console.log(`\n✓  Done! Processed ${updatedRows.length} rows in ${csvArg}.`);
}

main().catch(console.error);
