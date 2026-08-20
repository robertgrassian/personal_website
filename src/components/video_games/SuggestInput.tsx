"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/Icon";
import { inputClass, labelClass } from "./formStyles";
import { foldForSearch } from "./pipeline";
import { useVisibleViewportInsets } from "./useVisibleViewportInsets";

// Must match ModalShell's `duration-200` on the frame padding, which is what
// resizes the dialog body this component scrolls inside of.
const MODAL_REFLOW_MS = 200;

type SuggestInputProps = {
  /** Field label. Rendered for screen readers only when `labelHidden`. */
  label: string;
  labelHidden?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Offered as suggestions. Any free-text value is still allowed. */
  options: string[];
  maxLength?: number;
  placeholder?: string;
  /** Spacing for the wrapper. Everything inside it belongs to this component. */
  className?: string;
};

// The one text-field-with-suggestions control: the add form, the edit modal and
// the wishlist promote form all render this.
//
// A hand-rolled combobox rather than `<input list>` + `<datalist>`, which is
// what this was until 2026-08-15. Mobile Safari and Chrome for Android either
// ignore a datalist or bury it, so the suggestions existed on desktop only —
// the field was a bare text box on the devices most likely to be typing "PS5"
// with a thumb. Everything below is what the native control was doing for free:
// open/close, filtering, keyboard navigation, ARIA.
//
// The component owns its <label> instead of being dropped inside the caller's.
// A listbox nested in a <label> lands its option text in the input's accessible
// name (the name is computed from the label's whole subtree), and clicking an
// option triggers the label's own activation behaviour on top of ours.
export function SuggestInput({
  label,
  labelHidden = false,
  value,
  onChange,
  options,
  maxLength,
  placeholder,
  className = "",
}: SuggestInputProps) {
  // useId, not a literal: three of these can be mounted at once, and duplicate
  // ids would silently point aria-controls at the wrong list.
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;

  const [open, setOpen] = useState(false);
  // Whether the list is narrowed to what has been typed. Typing turns it on;
  // opening the list by click, chevron or ArrowDown turns it off. Without the
  // distinction, reopening the field after picking "SNES" would show a
  // one-item list containing "SNES" — filtering against a value the user has
  // already chosen hides every option they might switch to.
  const [filtering, setFiltering] = useState(false);
  // Which option the keyboard (or the pointer, via mouse-enter below) is on.
  // -1 = none, which is the state the list opens in: Enter then submits what
  // was typed rather than a suggestion nobody moved to.
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // foldForSearch is the library's own matcher (pipeline.ts), so "Pokemon"
  // finds "Pokémon" here exactly as it does in the filter bar.
  const suggestions = useMemo(() => {
    if (!filtering) return options;
    const needle = foldForSearch(value.trim());
    if (needle === "") return options;
    return options.filter((o) => foldForSearch(o).includes(needle));
  }, [filtering, options, value]);

  // An empty popup is worse than none, so "open" is only real with something
  // to show. Everything reads this rather than `open`, including aria-expanded.
  const listOpen = open && suggestions.length > 0;

  const openList = (narrowed: boolean) => {
    setFiltering(narrowed);
    setOpen(true);
    setActiveIndex(-1);
  };

  const commit = (option: string) => {
    onChange(option);
    setOpen(false);
    setActiveIndex(-1);
    // Picking a suggestion is the end of the interaction, so on touch the
    // field gives focus up and the software keyboard drops with it. Keeping
    // focus there is right on a fine pointer, where it costs nothing and Tab
    // carries on from the field, and wrong on a phone, where it leaves half
    // the screen covered by a keyboard for a field nobody is typing in.
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
    }
  };

  // Pointer-down outside closes. A blur handler would be the obvious choice and
  // is the wrong one on touch: if any browser blurs the input before the tap's
  // click reaches an option, the list unmounts and the pick is lost. Nothing
  // here takes focus away from the input, so there is no blur to listen for.
  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [listOpen]);

  // Keep the highlighted option inside the scrolled list.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Every dialog body is a scroll container (ModalShell), so a list opened near
  // its bottom edge is clipped rather than overflowing the dialog. Scrolling it
  // into view is what makes the last option reachable on a phone, where the
  // band left above the keyboard is barely taller than the list itself. One
  // frame later, after the list has been laid out and can be measured.
  //
  // Re-run when the keyboard moves, not only on opening: tapping the field
  // opens the list and THEN raises the keyboard, which shrinks the dialog under
  // a list that has already been placed, leaving it clipped below the fold.
  const hidden = useVisibleViewportInsets();
  useEffect(() => {
    if (!listOpen) return;
    const scroll = () => listRef.current?.scrollIntoView({ block: "nearest" });
    const frame = requestAnimationFrame(scroll);
    // Twice, because the dialog is still animating out of the keyboard's way
    // when the first one measures: the body it scrolls has not finished
    // shrinking, so a list that just fit can end up clipped again. The second
    // pass lands after ModalShell's padding transition and is a no-op whenever
    // the first was enough.
    const settled = setTimeout(scroll, MODAL_REFLOW_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [listOpen, hidden]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Otherwise the caret jumps to the start or end of the text.
      e.preventDefault();
      if (!listOpen) {
        openList(false);
        return;
      }
      const last = suggestions.length - 1;
      const forward = e.key === "ArrowDown";
      setActiveIndex((i) => {
        if (i < 0) return forward ? 0 : last;
        return forward ? (i === last ? 0 : i + 1) : i === 0 ? last : i - 1;
      });
      return;
    }
    if (e.key === "Enter" && listOpen && activeIndex >= 0) {
      e.preventDefault();
      commit(suggestions[activeIndex]);
      return;
    }
    if (e.key === "Escape" && listOpen) {
      // useModalChrome closes the dialog on Escape from a window listener.
      // React's own listener sits below window, so stopping propagation here
      // keeps the first Escape for the list and leaves the second for the
      // dialog. Only when the list is open, or Escape would stop closing it.
      e.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className={labelHidden ? "sr-only" : labelClass}>
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          // "list" = the popup suggests values but never rewrites the field as
          // you type, which is what this does.
          aria-autocomplete="list"
          aria-activedescendant={
            listOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          // The browser's own autofill popup would otherwise cover ours.
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            openList(true);
          }}
          onClick={() => openList(false)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder={placeholder}
          // pr-8 clears the chevron. It wins over inputClass's px-2 because
          // Tailwind emits the longhand after the shorthand.
          className={`${inputClass} pr-8`}
        />

        {/* The only hint on a phone that suggestions exist at all: there is no
            hover, and tapping the field raises the keyboard over whatever the
            field might have revealed. tabIndex -1 keeps it out of the tab
            order, where it would be a second stop that does what ArrowDown
            already does. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show suggestions"
          // Keeps focus (and the caret) where it is: a button press would
          // otherwise move focus out of the field. Deliberately does not focus
          // the input either, so tapping the chevron on a phone opens the list
          // without raising the keyboard on top of it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (listOpen ? setOpen(false) : openList(false))}
          className="absolute inset-y-0 right-0 flex items-center px-2 text-shelf-text-muted hover:text-shelf-text transition-colors cursor-pointer"
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${listOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {listOpen && (
        // top-full: the input is the last in-flow child, so the list hangs off
        // the bottom of the field. bg-shelf-bg, not bg-shelf-input, which is
        // translucent in dark mode and would show the form through the popup.
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded border border-shelf-input-border bg-shelf-bg py-1 shadow-lg"
        >
          {suggestions.map((option, i) => (
            <li
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option === value}
              // Selection is click, not mouse-down, so a drag off the option
              // cancels it as it would on any other control. The mouse-down
              // handler is only there to stop the press moving focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(option)}
              // Hover and keyboard share one highlight rather than painting two
              // different "this one" states at once.
              onMouseEnter={() => setActiveIndex(i)}
              className={`cursor-pointer px-2 py-2 text-base pointer-fine:text-sm text-shelf-text ${
                i === activeIndex ? "bg-shelf-input" : ""
              } ${option === value ? "font-medium" : ""}`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
