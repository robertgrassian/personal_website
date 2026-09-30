"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

// The detail card's entrance and exit when it is opened from the CRT rather
// than a shelf case.
//
// useCardFlight's flip cannot serve here: it scales the card uniformly onto a
// 2:3 case, and a 4:3 screen is not one, so the card could never land on it.
// This never scales the card. It moves the full-size card over the screen and
// clips it to a window the screen's exact size, then opens the window. Any
// rectangle is reachable that way, so both ends match the screen by
// construction.

export const REVEAL_OPEN_MS = 460;
const REVEAL_CLOSE_MS = 380;
const EASING = "cubic-bezier(0.2, 0.7, 0.3, 1)";
// The card's own corners, rounded-lg.
const CARD_RADIUS = "0.5rem";
// How soft the TV picture gets before it hands over to the card's own blurred
// cover. Reached early, so the card never reads as settling and then blurring.
const PICTURE_BLUR = "blur(14px)";

function findScreen(screenId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-card-screen="${CSS.escape(screenId)}"]`);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ScreenWindow = { transform: string; clipPath: string; width: number; height: number };

// Where the card has to sit, and what of it may show, to cover exactly the
// screen. The screen's rect is post-transform (the compact cabinet is scaled),
// so its corner radius is scaled by the same factor.
function screenWindow(screen: HTMLElement, card: DOMRect): ScreenWindow {
  const s = screen.getBoundingClientRect();
  const scale = screen.offsetWidth > 0 ? s.width / screen.offsetWidth : 1;
  const [rx, ry = rx] = getComputedStyle(screen)
    .borderTopLeftRadius.split(" ")
    .map((v) => parseFloat(v) * scale);
  const dx = s.left + s.width / 2 - (card.left + card.width / 2);
  const dy = s.top + s.height / 2 - (card.top + card.height / 2);
  const insetX = Math.max(0, (card.width - s.width) / 2);
  const insetY = Math.max(0, (card.height - s.height) / 2);
  return {
    transform: `translate(${dx}px, ${dy}px)`,
    clipPath: `inset(${insetY}px ${insetX}px round ${rx}px / ${ry}px)`,
    width: Math.min(s.width, card.width),
    height: Math.min(s.height, card.height),
  };
}

function onScreen(screen: HTMLElement): boolean {
  const r = screen.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

type UseScreenRevealArgs = {
  // The `data-card-screen` of the element to open from. null disables the
  // hook, and the card uses its ordinary flight.
  screenId: string | null;
  cardRef: RefObject<HTMLDivElement | null>;
  // A copy of the TV picture laid over the card. It starts at the screen's
  // size, so the first frame is what the TV was already showing, and fades as
  // it grows.
  pictureRef: RefObject<HTMLDivElement | null>;
  onClosed: () => void;
};

export function useScreenReveal({ screenId, cardRef, pictureRef, onClosed }: UseScreenRevealArgs) {
  const [closing, setClosing] = useState(false);
  const openRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // Opening. Mount-only, like the flight: the screen is measured once, here.
  useLayoutEffect(() => {
    if (screenId === null) return;
    const card = cardRef.current;
    const picture = pictureRef.current;
    const screen = findScreen(screenId);
    if (card === null || picture === null || screen === null || prefersReducedMotion()) {
      openRef.current = true;
      return;
    }
    const rect = card.getBoundingClientRect();
    const from = screenWindow(screen, rect);
    const timing = { duration: REVEAL_OPEN_MS, easing: EASING, fill: "forwards" as FillMode };
    const move = card.animate(
      [
        { transform: from.transform, clipPath: from.clipPath },
        { transform: "none", clipPath: `inset(0px round ${CARD_RADIUS})` },
      ],
      timing
    );
    // Width and height rather than a scale, so the cover re-crops as it grows
    // instead of stretching. One small absolutely positioned box, so the
    // per-frame layout is cheap. Blurred by 40% and gone by 70%, so the last
    // stretch of the grow is already the card as it will rest.
    const fade = picture.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px`, opacity: 1, filter: "blur(0px)" },
        { opacity: 0.9, filter: PICTURE_BLUR, offset: 0.4 },
        { opacity: 0, filter: PICTURE_BLUR, offset: 0.7 },
        { width: `${rect.width}px`, height: `${rect.height}px`, opacity: 0, filter: PICTURE_BLUR },
      ],
      timing
    );
    Promise.all([move.finished, fade.finished])
      .then(() => {
        openRef.current = true;
        move.cancel();
        fade.cancel();
      })
      .catch(() => {});
    return () => {
      move.cancel();
      fade.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing. The screen is re-measured live: the page can have scrolled.
  useLayoutEffect(() => {
    if (!closing || screenId === null) return;
    const card = cardRef.current;
    const picture = pictureRef.current;
    const screen = findScreen(screenId);
    const done = () => onClosedRef.current();
    if (
      card === null ||
      picture === null ||
      screen === null ||
      !onScreen(screen) ||
      prefersReducedMotion()
    ) {
      done();
      return;
    }

    // Pinned to a fixed px box before measuring, for the reason useCardFlight
    // gives: closing blurs a focused field, the keyboard leaves, and iOS grows
    // the layout viewport mid-animation, which would re-centre the card under
    // a transform measured before it moved.
    const before = card.getBoundingClientRect();
    card.style.position = "fixed";
    card.style.top = `${before.top}px`;
    card.style.left = `${before.left}px`;
    card.style.width = `${before.width}px`;
    card.style.height = `${before.height}px`;
    card.style.maxWidth = "none";
    card.style.maxHeight = "none";
    card.style.margin = "0";

    const rect = card.getBoundingClientRect();
    const to = screenWindow(screen, rect);
    const timing = { duration: REVEAL_CLOSE_MS, easing: EASING, fill: "forwards" as FillMode };
    const move = card.animate(
      [
        { transform: "none", clipPath: `inset(0px round ${CARD_RADIUS})` },
        { transform: to.transform, clipPath: to.clipPath },
      ],
      timing
    );
    const fade = picture.animate(
      [
        { width: `${rect.width}px`, height: `${rect.height}px`, opacity: 0, filter: PICTURE_BLUR },
        { opacity: 0.9, filter: PICTURE_BLUR, offset: 0.35 },
        { width: `${to.width}px`, height: `${to.height}px`, opacity: 1, filter: "blur(0px)" },
      ],
      timing
    );
    Promise.all([move.finished, fade.finished])
      .then(done)
      .catch(() => {});
    return () => {
      move.cancel();
      fade.cancel();
    };
  }, [closing, screenId, cardRef, pictureRef]);

  // Ignored until the opening lands, as in useCardFlight.
  const close = useCallback(() => {
    if (openRef.current) setClosing(true);
  }, []);

  return { close, closing };
}
