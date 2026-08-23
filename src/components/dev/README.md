# Temporary instrumentation

All of this exists to diagnose the detail card's top edge moving when the
software keyboard opens, and should be deleted once that is fixed: this folder,
`src/app/dev/`, and the guarded line in `src/app/layout.tsx`.

## Why a console snippet as well

`RectLogOverlay` and `/dev/keyboard-lab` are gated on `VERCEL_ENV`, so they are
absent from the production deploy. That is deliberate, and it is also a problem:
the bug happens on production, with real data and a signed-in owner, and the lab
does not reproduce it.

The snippet below records the same thing with nothing deployed. Run it against
production from Safari Web Inspector.

## Running it against production

1. iPhone: Settings, Safari, Advanced, turn on Web Inspector.
2. Mac: Safari, Settings, Advanced, tick "Show features for web developers".
3. Connect the phone by cable, and open the library page on the phone.
4. Mac Safari: Develop menu, pick the phone, pick the page.
5. Paste the snippet into the console that opens, and press return.
6. On the phone, open a game and tap the System field.
7. A `REST:` line prints on its own once things settle. `__rect()` reprints it,
   and `__rectStop()` removes the listeners.

Each entry reads `top H h H [band H off H lay H y H]`: the card's top edge and
height, then the visual viewport's height and offset, the layout viewport, and
the document scroll. A move is the top changing with the height steady; a resize
is the height changing, which pulls a centred card's top edge down without the
card moving anywhere.

```js
(() => {
  const el = () => document.querySelector(".game-card-flight");
  if (window.__rectStop) window.__rectStop();
  let seen = [],
    last = "",
    t0 = 0,
    until = 0,
    raf = 0;
  const vv = window.visualViewport;
  const sample = () => {
    const e = el();
    if (e) {
      const r = e.getBoundingClientRect();
      const key = Math.round(r.top) + ":" + Math.round(r.height);
      if (key !== last) {
        last = key;
        seen.push({
          t: Math.round(performance.now() - t0),
          top: Math.round(r.top),
          h: Math.round(r.height),
          off: Math.round(vv ? vv.offsetTop : 0),
          band: Math.round(vv ? vv.height : 0),
          lay: document.documentElement.clientHeight,
          y: Math.round(window.scrollY),
        });
      }
    }
    if (performance.now() < until) raf = requestAnimationFrame(sample);
    else if (seen.length) report();
  };
  const report = () => {
    const rests = seen.filter((s, i) => i === seen.length - 1 || seen[i + 1].t - s.t >= 150);
    console.log(
      "REST: " +
        rests
          .map((r) => `top ${r.top} h ${r.h} [band ${r.band} off ${r.off} lay ${r.lay} y ${r.y}]`)
          .join("  ->  ")
    );
    console.table(seen);
  };
  const kick = () => {
    const now = performance.now();
    if (!t0 || now - until > 3000) {
      t0 = now;
      seen = [];
      last = "";
    }
    until = now + 2500;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sample);
  };
  vv && vv.addEventListener("resize", kick);
  vv && vv.addEventListener("scroll", kick);
  window.addEventListener("focusin", kick);
  window.__rect = report;
  window.__rectStop = () => {
    cancelAnimationFrame(raf);
    vv && vv.removeEventListener("resize", kick);
    vv && vv.removeEventListener("scroll", kick);
    window.removeEventListener("focusin", kick);
  };
  kick();
  console.log("rect recorder armed. Tap the System field; a REST line prints when it settles.");
})();
```

## Reading a capture

`top 84 h 483 -> top 12 h 365 -> top 84 h 483` is an open and then a close: the
card rose and shrank as the keyboard arrived, then went back to exactly its
no-keyboard box. Both moves are earned, and ending precisely where it started is
the giveaway that the keyboard closed rather than the card misbehaving. The
bracketed viewport numbers are what settle that; without them the same two rows
could equally be a bug.
