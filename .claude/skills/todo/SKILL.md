---
name: todo
description: "Manage the project TODO list. Add: /todo [task]. Done: /todo done [task]. Do: /todo do [task]. List: /todo list."
argument-hint: "[list | done | do] [description of the task]"
disable-model-invocation: false
---

Check the first word of `$ARGUMENTS` (case-insensitive) to determine the mode: `list`, `done`, `do`, or a new item.

## If listing (`/todo list`)

Read `TODO.md` and present a concise summary of what to work on. Show:

1. **In Progress** — everything in this section (these are active tasks).
2. **Up Next** — everything in this section (these are queued up).

Do **not** show Backlog, Recently Completed, or future/deferred sections unless the user asks. Keep the output short and scannable.

## If marking done (`/todo done <description>`)

The description after "done" identifies which task to complete. Find the matching item across all sections of `TODO.md` (it may not be an exact match — use the description to find the best match).

1. **Remove** the matching `- [ ]` line from whatever section it's in.
2. **Add** it to the **Recently Completed** section as `- [x] <task description>`, inserted at the **top** of that section (newest first).
3. If **Recently Completed** already has 3 entries, remove the **bottom** (oldest) entry to keep it at 3 max.
4. If no matching item is found, let the user know.

## If implementing a task (`/todo do <description>`)

The description after "do" identifies which task to implement. Find the best-matching `- [ ]` item across all sections of `TODO.md`.

1. Read `TODO.md` to find the matching task. If no match is found, let the user know and stop.
2. Implement the task — read whatever files are needed, make the changes, and explain what you did.
3. Immediately after writing the changes to the codebase, mark the item done: remove the `- [ ]` line and add it as `- [x]` at the top of **Recently Completed**, keeping that section at 3 entries max.

Do **not** ask the user whether the changes look good before marking done. The act of applying changes to the codebase (whether auto-accepted or manually accepted by the user) is sufficient — mark it done as the final step of the implementation.

## If adding a new item (no recognized prefix)

Before adding, read `TODO.md` and check whether a similar item already exists in any section.

**If a sufficiently similar item already exists:**

- Do not create a new entry.
- If the new request contains meaningful additional detail (more specifics, edge cases, clarification) that the existing item lacks, update the existing item's text to incorporate it — keep it concise.
- Tell the user what you found and what (if anything) you changed.

**If no similar item exists:**
Add the following item to the **Backlog / Ideas** section of `TODO.md`:

```
- [ ] $ARGUMENTS
```

Insert it as the **first** line of the "Backlog / Ideas" section (top of the list, right after the heading). Do not modify any other section.
