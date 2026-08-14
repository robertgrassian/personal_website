"use client";

import { useId } from "react";
import { inputClass } from "./formStyles";

type SuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Offered as suggestions. Any free-text value is still allowed. */
  options: string[];
  maxLength?: number;
  placeholder?: string;
};

// The one text-field-with-suggestions control: the add form, the edit modal and
// the wishlist promote form all render this. Sharing it is what makes the
// tracked combobox rewrite (datalists do not work on mobile) a change to one
// file rather than three.
//
// Renders a fragment, not a wrapper, so callers keep their own <label> and
// spacing.
export function SuggestInput({
  value,
  onChange,
  options,
  maxLength,
  placeholder,
}: SuggestInputProps) {
  // useId, not a literal: three of these can be mounted at once, and duplicate
  // ids would silently bind an input to the wrong list.
  const listId = useId();

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Chrome opens a datalist only on a click into an already-focused
        // field, so the first click into an empty box showed nothing.
        // showPicker() asks for it directly. It needs user activation, so
        // Tab-focus throws and keeps the browser's own behaviour.
        onFocus={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Unsupported, or focused without user activation.
          }
        }}
        list={listId}
        maxLength={maxLength}
        placeholder={placeholder}
        className={inputClass}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
