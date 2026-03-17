// Shared color-extraction service — a single FastAverageColor instance and a
// sequential queue so canvas work doesn't all fire on the same frame.
//
// Without this, every GameCase creates its own FAC instance and they all
// race to getImageData on page load, janking the main thread.

import { FastAverageColor, type FastAverageColorResult } from "fast-average-color";

const fac = new FastAverageColor();

// Simple FIFO queue — each extraction waits for the previous one to finish,
// spreading canvas work across frames instead of doing it all at once.
let queue: Promise<void> = Promise.resolve();

export function extractDominantColor(img: HTMLImageElement): Promise<FastAverageColorResult> {
  return new Promise((resolve, reject) => {
    queue = queue.then(() =>
      fac.getColorAsync(img, { algorithm: "dominant" }).then(resolve).catch(reject)
    );
  });
}
