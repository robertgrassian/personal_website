---
name: proj-todo
description: "Owns the project backlog in TODO.md at the repo root — NOT the in-session task tracker (TaskCreate/TaskUpdate), which is unrelated. Invoke for every interaction with that file, reads included: 'add to my todos', 'what should I work on next', 'mark X done', 'is X on my list?', 'drop that item', 'clean up the todo list', and any time you would otherwise read or edit TODO.md yourself."
argument-hint: "[what you want to do]"
disable-model-invocation: false
---

**Work out what was meant from the request itself. There is no command syntax to parse.** The user talks to this skill in ordinary language, whether they typed `/todo` or just said something in passing, so route on intent:

| What they want                             | Section                         |
| ------------------------------------------ | ------------------------------- |
| Consult the list, or you need its contents | Reading or answering a question |
| Pick something to work on                  | What to work on next            |
| A quick overview                           | Showing the list                |
| Something is finished                      | Marking done                    |
| Do one of the items now                    | Implementing a task             |
| Capture something new                      | Adding a new item               |
| Drop an item no longer wanted              | Removing an item                |
| Reorganize, prune, fix the file            | Reorganizing                    |

Keyword prefixes like "done" or "list" are a hint, never a rule: "the wishlist thing is done" is a completion, and "add a todo to list the systems on each shelf" is a new item despite both words appearing. When the request genuinely fits two sections, prefer the non-destructive one and say what you assumed. A bare invocation with nothing after it means show the list.

**What the three open sections mean**, since almost every decision below depends on it:

- **Up Next** — the queue. What would reasonably be started this week, whatever kind of work it is. **Hard cap of 5**, enforced on every write (see the structure check). This is the only section with a cap, and the cap is the point: an uncapped queue is just a backlog with a better name.
- **Bugs** — every confirmed defect that is not urgent enough for Up Next. Ordered by severity, roughly, but no strict guarantee. Uncapped, because a bug list that evicts bugs is lying.
- **Backlog / Ideas** — everything else. Ideas, nice-to-haves, and work that is real but not scheduled. No ordering guarantee beyond newest-first.

**Bugs got its own section 2026-08-07, and the reason is worth keeping.** The old rule sent every "confirmed bug" straight to Up Next. Bug reports are the most common kind of item this project generates, and nothing in the skill ever demoted anything, so Up Next was a one-way door that filled monotonically: at the time of the change it held five items, four of them bugs, with a diacritic-matching miss sitting at the same priority as an unbuilt endpoint the privacy policy already promised. Splitting them makes the admission test objective ("is this a defect?") instead of a severity judgment the skill would have to re-make on every add and re-grade forever after.

**File order is Up Next, Bugs, Backlog / Ideas, then Recently Completed** — open work first, the archive last, because the archive is the longest section and the least often read. Moved there 2026-07-30; do not "fix" it back. Every rule below finds its section by heading name, never by position, so the order is a readability choice rather than something the logic depends on.

## Check the file's structure

Do this after deciding the mode, before acting. TODO.md gets edited outside this skill too, and those edits drift from the rules below — so this skill is where drift gets caught.

**What to do about drift depends on whether the mode is a write.**

- **Writing anyway** (marking done, implementing, adding, reorganizing): fix the drift silently as part of the change, and only mention it if something non-obvious moved.
- **Read-only** (answering a question, what to work on next, showing the list): **do not modify the file.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch, and a surprise modification to a tracked file is worse than a slightly untidy TODO. Mention what is out of place in a sentence at the end and offer to fix it.

The drift to look for:

1. **Any `- [x]` item outside "Recently Completed" is misplaced.** Move it to the top of Recently Completed. Compress it while moving: keep detail that stays useful as reference (a debugging gotcha, an accepted trade-off, a follow-up someone will need), drop the planning detail that only mattered while it was pending (step-by-step dashboard instructions, "quick fix vs long-term fix" framing).
2. **Fix cross-references broken by the move.** A remaining open item that said "see the gotcha above" needs repointing once that text moves to another section.
3. **Trim Recently Completed to 20 entries**, dropping the oldest from the bottom. Before dropping one, check whether it carries reference material still cited elsewhere in the file; if so, fold that detail into whatever item cites it rather than losing it.
4. **Prune stale framing in section headers and open items** — a note saying work is blocked on something that has since shipped is worse than no note.

## Reading or answering a question

Any request to consult the TODO that is not "what should I work on" or a request to see the whole list: "is X on my list?", "what did we say about the wishlist work?", "read me the backlog". Also use this when _you_ need the file's contents to answer something, rather than reading it directly.

Read `TODO.md`, answer the question, quote or summarize only the relevant entries. **Read-only: do not edit the file.**

Two things worth doing while you have it open, because they are cheap and the user cannot see them from a summary:

- If an entry's premise has gone stale (it describes behavior that has since changed, or cites a file that has moved), say so rather than repeating it as though it were current. An entry is only as good as its last verification.
- If the answer is "no, that is not on the list", say that plainly and offer to add it, rather than stretching a loosely-related item to fit.

## What to work on next

"What's next", "what should I work on", and similar. **Answer from `TODO.md` alone — do not explore the codebase.** Read the file, summarize what is in **Up Next**, and recommend one thing to start with.

Give a recommendation rather than a menu. If items block each other, say so and order them; if something is cheap now and expensive later, that is usually the one to lead with. Note when an item's stated blocker has since cleared.

## Showing the list

Read `TODO.md` in full, then give two short groups:

1. **Three you'd recommend**, each with a one-line reason. Weigh what unblocks other work, what is cheap now and expensive later, and what the user would enjoy building. Say why you picked, not just what.
2. **Three most recently added** — the top three entries in Backlog / Ideas, which is where new items land.

Keep it scannable. Show everything only if asked, and prefer summarizing a long section over dumping it.

## Marking done

Identify which task from what they said. Find the matching item across all sections of `TODO.md` (it may not be an exact match — use the description to find the best match).

Flip it to `- [x]`. The structure check above then moves it, compresses it, and enforces the cap — do not repeat that work here.

If no matching item is found, say so rather than guessing; the thing they finished may never have been written down, in which case offer to add it as already-done.

## Implementing a task

Identify which task from what they said. Find the best-matching `- [ ]` item across all sections of `TODO.md`.

1. Read `TODO.md` to find the matching task. If no match is found, let the user know and stop.
2. Implement the task — read whatever files are needed, make the changes, and explain what you did.
3. Immediately after writing the changes to the codebase, mark the item done: remove the `- [ ]` line and add it as `- [x]` at the top of **Recently Completed**, keeping that section at 20 entries max.

Do **not** ask whether the changes look good before marking done. Applying them is sufficient — mark it done as the final step.

**Size the approach to the item first, though.** Some entries in this file describe a directory move plus a redirect plus five call-site edits. For anything touching more than a couple of files, say what you intend to do and confirm before starting, then implement and mark done without a second check. The no-confirmation rule is about not seeking reassurance on finished work, not about skipping a plan on work that has real blast radius.

## Reorganizing

"Fix the todo list", "clean this up", "these should be grouped differently", or a change to the rules themselves (the cap, the sections, what belongs where).

Run the full structure check above and apply it, since this is a write. Then do whatever was actually asked, which is usually one of:

- **Items in the wrong section.** Completed work still sitting in Up Next, or something in Backlog that has become the next thing to do.
- **A rule change.** If the user changes one of the rules in this file, edit this file too, not just `TODO.md`. A rule followed once and not written down will not survive the session.
- **Entries that have gone stale.** An item whose premise no longer holds, or whose stated blocker has since cleared. Correct it rather than deleting it, and say what changed.

Report what moved and why, briefly. This is the one mode where the user cannot see the result at a glance, so a two-line summary of the structural changes is worth more than a diff they have to read.

## Removing an item

"Drop that", "we don't need that anymore", "skip the CRT idea". Deleting an entry you have decided against is a normal operation, distinct from correcting one that has gone stale.

1. **Identify exactly one entry** and say which, in a few words, before removing it. If more than one plausibly matches, ask.
2. **Remove that entry and nothing else.** Entries here run to twenty lines, so an entry is its `- [` line plus the indented continuation lines under it. It ends at whichever of these comes **first**: the next line-initial `- [` (either `- [ ]` or `- [x]`), the next `##` heading, or end of file. Anchoring on the _next_ heading or entry title instead will silently swallow everything in between.

   **All three terminators matter, and getting this wrong is how the accident below happened.** Watching only for `- [ ]` skips straight over a whole section of `- [x]` entries: with Recently Completed sitting between the two open sections, deleting the last open item in the section above it would scan past every completed entry to find the next open one. The `##` and EOF terminators are what stop that, and they are why this rule does not care which order the sections are in.

3. **Verify the count.** Open items before minus one equals open items after. This takes a second and is the only thing that reliably catches an over-broad delete.
4. **Repoint anything that referenced it** — "see the item above", and comments in the codebase that point at a tracked item.
5. **Say what was dropped and why**, so it can be reinstated from the transcript if it turns out to have been wanted.

This mode exists because it went wrong: a "remove one idea" edit anchored on the following entry's title and deleted four unrelated entries with it, including one that a comment in `src/app/privacy/page.tsx` still pointed at.

## Adding a new item

Before adding, read `TODO.md` and check whether a similar item already exists in any section.

**If a sufficiently similar item already exists:**

- Do not create a new entry.
- If the new request contains meaningful additional detail (more specifics, edge cases, clarification) that the existing item lacks, update the existing item's text to incorporate it — keep it concise.
- Tell the user what you found and what (if anything) you changed.

**If no similar item exists:** pick the section by what the item _is_, using the definitions at the top.

- **Backlog / Ideas** by default, inserted as the first entry right after the heading.
- **Up Next** when it is a confirmed bug, work already in flight, or something someone is waiting on. Say that you put it there, so a wrong call is easy to correct.

Do not modify any section other than the one you are adding to.

**Do not just paste their words in as a one-liner.** The phrasing is the starting point, not the entry. Before writing, spend a moment in the codebase confirming what is actually true — the file and line the item concerns, whether the thing described is really the current behavior, whether a related feature already exists. Then write an entry that will still make sense in three months to someone who has forgotten this conversation:

- **Lead with the ask** in bold, in the user's terms.
- **Correct the premise if it is wrong.** If the user describes current behavior inaccurately, say what the code actually does, with a `file.ts:line` reference. This is the single most valuable thing the entry can carry.
- **Name what makes it harder than it looks** — the constraint, the coupling, the thing that breaks if done naively. If it is genuinely a one-liner, say that instead; a short entry beats invented complexity.
- **Record the counter-argument** when there is a real trade-off, so the decision can be re-made rather than re-litigated.
- **Cross-reference related items** by name when one exists.

Aim for a few sentences to a short paragraph. `<br>` separates sub-points within an item. Match the density of the entries already in the file.

Keep the user's own words for the _want_, especially their phrasing of the problem — but never preserve a factual claim you have checked and found wrong. Say so in the entry and tell the user when you report back.
