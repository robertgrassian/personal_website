// Pure text transforms behind the notes toolbar. Each returns an Edit (replace
// [start, end) with `text`, then select [selStart, selEnd]) rather than a new
// string, because the caller applies it with the browser's own insertText so
// the change lands on the native undo stack. Assigning a new `value` would
// wipe that stack, which is what makes Cmd+Z and iOS shake-to-undo work after
// a toolbar press.
//
// Bullets are written as Markdown ("- "), so a note stays valid if notes are
// ever rendered as Markdown (docs/todo/game-notes-notes-markdown.md).

export type Edit = {
  start: number;
  end: number;
  text: string;
  selStart: number;
  selEnd: number;
};

// Indent, then "-", "*" or "•", then one space. "•" because notes typed before
// the toolbar, or pasted from elsewhere, use it.
const BULLET = /^(\s*)([-*•]) /;

function lineStart(text: string, index: number): number {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const next = text.indexOf("\n", index);
  return next === -1 ? text.length : next;
}

/** Bullet every line the selection touches, or un-bullet them if every
 *  non-blank one already is. Blank lines are left alone inside a multi-line
 *  selection, so paragraphs keep their spacing; a lone blank line (the caret
 *  on an empty note) gets a bullet, since that is how a list is started. */
export function toggleBullets(text: string, selStart: number, selEnd: number): Edit {
  // A selection ending at the very start of a line (triple-click selects the
  // trailing newline) does not include that line.
  const effectiveEnd = selEnd > selStart && text[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const start = lineStart(text, selStart);
  const end = lineEnd(text, effectiveEnd);
  const lines = text.slice(start, end).split("\n");

  const contentLines = lines.filter((l) => l.trim() !== "");
  const removing = contentLines.length > 0 && contentLines.every((l) => BULLET.test(l));

  // Caret mapped through the change, so it stays beside the same character
  // instead of jumping to the end of the block.
  let delta = 0;
  let caret = selStart;
  let offset = start;
  const out = lines.map((line) => {
    const bulleted = BULLET.test(line);
    // Adding skips lines that already have a bullet, so a mixed selection
    // evens out instead of double-bulleting.
    const skip = removing ? !bulleted : bulleted || (line.trim() === "" && lines.length > 1);
    const next = skip
      ? line
      : removing
        ? line.replace(BULLET, "$1")
        : line.replace(/^\s*/, (indent) => `${indent}- `);
    const lineDelta = next.length - line.length;
    if (offset <= selStart && selStart <= offset + line.length) {
      // Clamped to the line's new start: a caret inside a removed marker.
      const newLineStart = offset + delta;
      caret = Math.max(newLineStart, selStart + delta + lineDelta);
    }
    offset += line.length + 1;
    delta += lineDelta;
    return next;
  });

  const replaced = out.join("\n");
  if (selStart === selEnd) {
    return { start, end, text: replaced, selStart: caret, selEnd: caret };
  }
  return { start, end, text: replaced, selStart: start, selEnd: start + replaced.length };
}

/** What Enter should do at `caret`, or null to let the browser insert a plain
 *  newline. On a bullet line it starts the next bullet at the same indent; on
 *  an empty bullet it removes the marker instead, which is how every list
 *  editor ends a list. */
export function continueList(text: string, caret: number): Edit | null {
  const start = lineStart(text, caret);
  const end = lineEnd(text, caret);
  const line = text.slice(start, end);
  const match = line.match(BULLET);
  // Caret inside the marker itself: a plain newline is less surprising.
  if (!match || caret - start < match[0].length) return null;

  if (line.slice(match[0].length).trim() === "") {
    return { start, end, text: "", selStart: start, selEnd: start };
  }
  const insert = `\n${match[1]}${match[2]} `;
  const at = caret + insert.length;
  return { start: caret, end: caret, text: insert, selStart: at, selEnd: at };
}
