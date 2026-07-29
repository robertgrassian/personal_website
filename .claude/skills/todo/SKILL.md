---
name: todo
description: "Read, add, complete, reorder, or reword anything in TODO.md. Invoke this for EVERY TODO interaction, reads included, not just explicit /todo commands — 'add to my todos', 'what should I work on next', 'what's next', 'mark X done', 'is X on my list?', 'what did we say about X?', and any request to reorganize or clean up the TODO. Invoke it before reading or editing TODO.md directly for any reason, including when you need its contents to answer something. This skill owns that file's structure; reads through it are read-only and never modify the file."
argument-hint: "[list | done | do] [description of the task]"
disable-model-invocation: false
---

Check the first word of `$ARGUMENTS` (case-insensitive) to determine the mode: `list`, `done`, `do`, or a new item.

## Always: check the file's structure first

TODO.md gets edited outside this skill too, and those edits drift from the rules below — so this skill is where drift gets caught.

**What to do about drift depends on whether this invocation is already a write.**

- **Writing anyway** (`done`, `do`, adding, reorganizing): fix the drift silently as part of the change, and only mention it if something non-obvious moved.
- **Read-only** ("what's next", `list`, answering a question about the list): **do not modify the file.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch, and a surprise modification to a tracked file is worse than a slightly untidy TODO. Mention what is out of place in a sentence at the end and offer to fix it.

The drift to look for:

1. **Any `- [x]` item outside "Recently Completed" is misplaced.** Move it to the top of Recently Completed. Compress it while moving: keep detail that stays useful as reference (a debugging gotcha, an accepted trade-off, a follow-up someone will need), drop the planning detail that only mattered while it was pending (step-by-step dashboard instructions, "quick fix vs long-term fix" framing).
2. **Fix cross-references broken by the move.** A remaining open item that said "see the gotcha above" needs repointing once that text moves to another section.
3. **Trim Recently Completed to 20 entries**, dropping the oldest from the bottom. Before dropping one, check whether it carries reference material still cited elsewhere in the file; if so, fold that detail into whatever item cites it rather than losing it.
4. **Prune stale framing in section headers and open items** — a note saying work is blocked on something that has since shipped is worse than no note.

## If reading or answering a question about the list

Any request to consult the TODO that is not "what's next" or `list`: "is X on my list?", "what did we say about the wishlist work?", "read me the backlog". Also use this when _you_ need the file's contents to answer something, rather than reading it directly.

Read `TODO.md`, answer the question, quote or summarize only the relevant entries. **Read-only: do not edit the file.**

Two things worth doing while you have it open, because they are cheap and the user cannot see them from a summary:

- If an entry's premise has gone stale (it describes behavior that has since changed, or cites a file that has moved), say so rather than repeating it as though it were current. An entry is only as good as its last verification.
- If the answer is "no, that is not on the list", say that plainly and offer to add it, rather than stretching a loosely-related item to fit.

## If asked what to work on next

"What's next", "what should I work on", and similar. **Answer from `TODO.md` alone — do not explore the codebase.** Read the file, summarize what is in **Up Next**, and recommend one thing to start with.

Give a recommendation rather than a menu. If items block each other, say so and order them; if something is cheap now and expensive later, that is usually the one to lead with. Note when an item's stated blocker has since cleared.

## If listing (`/todo list`)

Read `TODO.md` in full, then output two sections:

### 1. Claude's Picks (3 items)

Scan every `- [ ]` item across all sections. Choose 3 that you'd most recommend tackling next. Consider: quick wins, high user-visible impact, things that would be impressive to a visitor, things that seem fun or satisfying to build, and items that unblock other work. For each pick, include a one-line reason why you're recommending it.

Format:

```
**Claude's Picks**
- [ ] <task> — <one-line reason>
- [ ] <task> — <one-line reason>
- [ ] <task> — <one-line reason>
```

### 2. Recently Added (3 items)

New items are always inserted at the **top** of the **Backlog / Ideas** section. Show the first 3 `- [ ]` items from that section as a proxy for most recently added.

Format:

```
**Recently Added**
- [ ] <task>
- [ ] <task>
- [ ] <task>
```

Keep the output short and scannable. Do **not** show all sections or every item unless the user asks.

## If marking done (`/todo done <description>`)

The description after "done" identifies which task to complete. Find the matching item across all sections of `TODO.md` (it may not be an exact match — use the description to find the best match).

1. **Remove** the matching `- [ ]` line from whatever section it's in.
2. **Add** it to the **Recently Completed** section as `- [x] <task description>`, inserted at the **top** of that section (newest first).
3. If **Recently Completed** now exceeds **20** entries, remove from the **bottom** (oldest) until it's back to 20.
4. If no matching item is found, let the user know.

## If implementing a task (`/todo do <description>`)

The description after "do" identifies which task to implement. Find the best-matching `- [ ]` item across all sections of `TODO.md`.

1. Read `TODO.md` to find the matching task. If no match is found, let the user know and stop.
2. Implement the task — read whatever files are needed, make the changes, and explain what you did.
3. Immediately after writing the changes to the codebase, mark the item done: remove the `- [ ]` line and add it as `- [x]` at the top of **Recently Completed**, keeping that section at 20 entries max.

Do **not** ask the user whether the changes look good before marking done. The act of applying changes to the codebase (whether auto-accepted or manually accepted by the user) is sufficient — mark it done as the final step of the implementation.

## If adding a new item (no recognized prefix)

Before adding, read `TODO.md` and check whether a similar item already exists in any section.

**If a sufficiently similar item already exists:**

- Do not create a new entry.
- If the new request contains meaningful additional detail (more specifics, edge cases, clarification) that the existing item lacks, update the existing item's text to incorporate it — keep it concise.
- Tell the user what you found and what (if anything) you changed.

**If no similar item exists:**
Insert a new item as the **first** entry of the "Backlog / Ideas" section (right after the heading). Do not modify any other section.

**Do not just paste `$ARGUMENTS` as a one-liner.** The user's phrasing is the starting point, not the entry. Before writing, spend a moment in the codebase confirming what is actually true — the file and line the item concerns, whether the thing described is really the current behavior, whether a related feature already exists. Then write an entry that will still make sense in three months to someone who has forgotten this conversation:

- **Lead with the ask** in bold, in the user's terms.
- **Correct the premise if it is wrong.** If the user describes current behavior inaccurately, say what the code actually does, with a `file.ts:line` reference. This is the single most valuable thing the entry can carry.
- **Name what makes it harder than it looks** — the constraint, the coupling, the thing that breaks if done naively. If it is genuinely a one-liner, say that instead; a short entry beats invented complexity.
- **Record the counter-argument** when there is a real trade-off, so the decision can be re-made rather than re-litigated.
- **Cross-reference related items** by name when one exists.

Aim for a few sentences to a short paragraph. `<br>` separates sub-points within an item. Match the density of the entries already in the file.

Keep the user's own words for the _want_, especially their phrasing of the problem — but never preserve a factual claim you have checked and found wrong. Say so in the entry and tell the user when you report back.
