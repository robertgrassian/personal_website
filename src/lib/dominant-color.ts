// Shared color-extraction service: a single FastAverageColor instance, a
// sequential queue so canvas work doesn't all fire on the same frame, and a
// cache of what it found.
//
// Without this, every GameCase creates its own FAC instance and they all
// race to getImageData on page load, janking the main thread.

import { FastAverageColor } from "fast-average-color";

const fac = new FastAverageColor();

// Simple FIFO queue — each extraction waits for the previous one to finish,
// spreading canvas work across frames instead of doing it all at once.
let queue: Promise<void> = Promise.resolve();

export type DominantColor = { hex: string; isDark: boolean };

// Keyed by cover URL, and outliving any component. The built-in shelf re-cuts
// its rows on every width change, which remounts every GameCase in the group;
// without this each remount would drop the colour it had and re-queue the read
// behind every other card on the page.
const cache = new Map<string, DominantColor>();

export function cachedDominantColor(key: string): DominantColor | null {
  return cache.get(key) ?? null;
}

export function extractDominantColor(img: HTMLImageElement, key: string): Promise<DominantColor> {
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);

  return new Promise((resolve, reject) => {
    queue = queue.then(() =>
      fac
        .getColorAsync(img, { algorithm: "dominant" })
        .then((result) => {
          const value: DominantColor = { hex: result.hex, isDark: result.isDark };
          cache.set(key, value);
          resolve(value);
        })
        .catch(reject)
    );
  });
}
