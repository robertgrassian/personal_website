"use client";

import type { ReactNode } from "react";

/** Which token family the strip sits on: the library's shelf, or the page. */
type TabTone = "shelf" | "page";

type Tab<T extends string> = { value: T; label: ReactNode };

type TabBarProps<T extends string> = {
  tabs: readonly Tab<T>[];
  /** Widened past T on purpose: the library's view state also holds values
   *  with no tab of their own (the follower lists), and none of them being
   *  selected is a legitimate state for the strip. */
  value: string;
  onChange: (value: T) => void;
  tone?: TabTone;
  /** Classes for the strip itself, which is where its gap belongs. */
  className?: string;
  /** Classes for every tab: text sizing, mostly, which differs per strip
   *  because the library's has to survive a 320px phone. */
  tabClassName?: string;
};

// A selected tab is a STATE, not a primary action, so it takes accent border
// and accent text rather than the fill a primary button gets. See buttonStyles.
//
// The weight lives on the state classes rather than here, so that only one of
// them ever applies: font-medium and font-semibold have equal specificity, and
// which wins is decided by their order in the generated stylesheet, not by the
// order they appear in a className string.
// The 3px underline is on EVERY tab, transparent when idle, so the selected
// one is half again as heavy without any tab changing height when selection
// moves.
const tabClass = "-mb-px whitespace-nowrap border-b-[3px] py-2.5 transition-colors cursor-pointer";

// Selection is signalled on three channels, not one. The accent is a muted
// green by design (see accent.ts), so it cannot carry the whole job by getting
// louder; what it can do is arrive alongside more weight and more area.
//
// Area comes from the underline rather than a background tint, because a tint
// needs horizontal padding to not read as a highlighter stripe, and the
// library's strip has no width to spend on it at 320px.
const selectedClass = "border-link font-semibold text-link";

// Idle drops to font-normal so the gap to `font-semibold` is two steps rather
// than one. Quieting the unselected state raises the contrast between them
// without touching the accent at all, which is the only lever here that costs
// the palette nothing.
const idleClass: Record<TabTone, string> = {
  shelf:
    "border-transparent font-normal text-shelf-text-muted hover:border-shelf-plank hover:text-link",
  page: "border-transparent font-normal text-muted hover:border-divider hover:text-foreground",
};

/** An underlined tab strip. Deliberately NOT role="tablist": neither call site
 *  wires panels to tabs with aria-controls, and the roles promise a keyboard
 *  contract (arrow-key navigation) that neither implements. aria-current is
 *  true either way and says the one thing a screen reader is missing. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  tone = "shelf",
  className = "",
  tabClassName = "",
}: TabBarProps<T>) {
  return (
    <div className={`flex ${className}`.trim()}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          aria-current={tab.value === value ? "true" : undefined}
          className={`${tabClass} ${tab.value === value ? selectedClass : idleClass[tone]} ${tabClassName}`.trim()}
        >
          {/* Every tab reserves the width its label takes at font-semibold, so
              selecting one does not nudge the rest of the strip sideways. The
              two copies are stacked in a single grid cell: the hidden one sets
              the width, the visible one draws at the state's actual weight. */}
          <span className="grid">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">
              {tab.label}
            </span>
            <span className="col-start-1 row-start-1">{tab.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
