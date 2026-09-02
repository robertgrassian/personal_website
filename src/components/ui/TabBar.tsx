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
// The weight is set per state rather than here: font-medium and font-semibold
// have equal specificity, so putting both on one element would be settled by
// their order in the generated stylesheet, not by the className string.
const tabClass = "-mb-px whitespace-nowrap border-b-2 py-2.5 transition-colors cursor-pointer";

const selectedClass = "border-link font-semibold text-link";

const idleClass: Record<TabTone, string> = {
  shelf:
    "border-transparent font-medium text-shelf-text-muted hover:border-shelf-plank hover:text-link",
  page: "border-transparent font-medium text-muted hover:border-divider hover:text-foreground",
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
          {/* Two copies of the label stacked in one grid cell, so the tab is
              always as wide as its bold form and selecting one cannot nudge the
              strip sideways. The hidden copy sets the width, the visible one
              draws at the state's actual weight. */}
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
