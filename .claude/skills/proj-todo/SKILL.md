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
| Move an item to Up Next                    | Promotion by request            |
| Drop an item no longer wanted              | Removing an item                |
| Reorganize, prune, fix the file            | Reorganizing                    |

Keyword prefixes like "done" or "list" are a hint, never a rule: "the wishlist thing is done" is a completion, and "add a todo to list the systems on each shelf" is a new item despite both words appearing. When the request genuinely fits two sections, prefer the non-destructive one and say what you assumed. A bare invocation with nothing after it means show the list.

**The three open sections**, since almost every decision below depends on them:

- **Up Next** — the queue, admission rules under "Adding a new item". **Hard cap of 5**, enforced on every write. An uncapped queue is just a backlog with a better name.
- **Bugs** — every confirmed defect that has not cleared the Up Next bar. Roughly severity-ordered, uncapped.
- **Backlog / Ideas** — everything else. Newest first, no other ordering guarantee.

Bugs was split out from Up Next on 2026-08-07: the old rule admitted any "confirmed bug", so four of five slots were defects and nothing was ever demoted. Do not merge them back.

**File order is Up Next, Bugs, Backlog / Ideas, then Recently Completed** — open work first, the archive last. Set 2026-07-30; do not "fix" it back. Every rule below finds its section by heading name, never by position.

## Check the file's structure

Do this after deciding the mode, before acting. TODO.md gets edited outside this skill too, so this is where drift gets caught.

- **Writing anyway** (marking done, implementing, adding, promoting, reorganizing): fix drift silently, mentioning only what moved non-obviously.
- **Read-only** (answering a question, what to work on next, showing the list): **do not modify the file.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch. Mention what is out of place at the end and offer to fix it.

The drift to look for:

1. **Any `- [x]` item outside Recently Completed** moves to the top of it. Compress while moving: keep what stays useful as reference (a debugging gotcha, an accepted trade-off, a follow-up someone will need), drop the planning detail that only mattered while it was pending.
2. **Fix cross-references broken by the move.** An open item saying "see the gotcha above" needs repointing once that text moves.
3. **Trim Recently Completed to 20 entries**, oldest first. Before dropping one, check whether it carries reference material cited elsewhere; if so, fold that detail into the citing item.
4. **Prune stale framing** in section headers and open items — a note saying work is blocked on something that has since shipped is worse than no note.
5. **Enforce the Up Next cap of 5.** Rank the excess by the admission test, move the weakest to **Bugs** if it is a defect and **Backlog / Ideas** otherwise. Say what moved and why; never demote silently. **Never auto-demote an item marked `Promoted by request`** — if every candidate is pinned, ask. **Demote, never delete**; only "Removing an item" deletes.
6. **A confirmed defect in Backlog / Ideas belongs in Bugs**, unless it is in Up Next. Ideas about how something _could_ work are not defects. When genuinely ambiguous, leave it rather than churning the file.

## Reading or answering a question

Any request to consult the TODO that is not "what should I work on" or a request for the whole list. Also use this when _you_ need the file's contents to answer something.

Read `TODO.md`, answer, quote or summarize only the relevant entries. **Read-only: do not edit the file.**

Two things worth doing while you have it open, since the user cannot see them from a summary:

- If an entry's premise has gone stale (it describes behavior that has since changed, or cites a file that has moved), say so rather than repeating it as current.
- If the answer is "not on the list", say so plainly and offer to add it, rather than stretching a loosely-related item to fit.

## What to work on next

**Answer from `TODO.md` alone — do not explore the codebase.** Summarize **Up Next** and recommend one thing to start with. Give a recommendation, not a menu: if items block each other, order them; if something is cheap now and expensive later, lead with it. Note when an item's stated blocker has cleared.

**Read Bugs too, but lead with Up Next.** Close with one line on the bug list ("three open bugs, worst is X") rather than merging the two into one ranked list. If a bug has become urgent enough to lead with, say so and offer to promote it rather than recommending it from where it sits.

## Showing the list

Read `TODO.md` in full, then give two short groups:

1. **Three you'd recommend**, each with a one-line reason. Weigh what unblocks other work, what is cheap now and expensive later, and what the user would enjoy building. Say why you picked.
2. **Three most recently added** — the top three in Backlog / Ideas, where new items land.

Then one line for **Bugs**: how many, and the worst. Keep it scannable; summarize long sections rather than dumping them.

## Marking done

Identify which task from what they said, matching on description across all sections. Flip it to `- [x]`; the structure check then moves, compresses, and caps it.

If nothing matches, say so rather than guessing — it may never have been written down, in which case offer to add it as already-done.

## Implementing a task

Find the best-matching `- [ ]` item. If no match, say so and stop.

1. Implement it — read whatever files are needed, make the changes, explain what you did.
2. Immediately after writing the changes, mark it done: remove the `- [ ]` line, add it as `- [x]` at the top of **Recently Completed**.

Do **not** ask whether the changes look good before marking done. Applying them is sufficient.

**Size the approach first, though.** Some entries describe a directory move plus a redirect plus five call-site edits. For anything touching more than a couple of files, say what you intend to do and confirm before starting, then implement and mark done without a second check. The no-confirmation rule is about not seeking reassurance on finished work, not about skipping a plan on work with real blast radius.

## Promotion by request

**"I want to do X next" puts X in Up Next, full stop.** No test applies and no justification is needed — wanting to build the fun thing on a Saturday is a complete reason. Covers "move X to up next", "bump X up", "X is what I'm doing next", from Bugs or Backlog, to the **top** of Up Next unless told otherwise.

**Mark it on the entry's first line: `(Promoted by request YYYY-MM-DD.)`** Without the marker the cap rule ranks it weakest by the objective test and evicts it on the next write, silently undoing the decision.

Two things this does not override:

- **The cap still holds at 5.** A sixth promotion means demoting one, and the user chooses which — they have just stated their priorities, so do not guess at the rest.
- **Read-only modes stay read-only.** "What's next?" is a question, not a promotion.

The pin clears when the item is completed or the user demotes it. If a pinned item has sat untouched and the cap is under pressure, point that out and ask — different from acting.

## Reorganizing

"Fix the todo list", "clean this up", or a change to the rules themselves (the cap, the sections, what belongs where).

Run the full structure check, since this is a write. Then do what was asked, usually one of:

- **Items in the wrong section.**
- **A rule change.** If the user changes a rule in this file, edit this file too, not just `TODO.md`. A rule followed once and not written down will not survive the session.
- **Entries that have gone stale.** Correct them rather than deleting, and say what changed.

Report what moved and why in two lines. This is the one mode where the user cannot see the result at a glance.

## Removing an item

"Drop that", "we don't need that anymore". Deleting an entry decided against is normal, and distinct from correcting one that has gone stale.

1. **Identify exactly one entry** and say which before removing it. If more than one plausibly matches, ask.
2. **Remove that entry and nothing else.** An entry is its `- [` line plus the indented continuation lines under it, ending at whichever comes **first**: the next line-initial `- [` (either `- [ ]` or `- [x]`), the next `##` heading, or EOF.

   **All three terminators matter.** Watching only for `- [ ]` skips over any run of `- [x]` entries and swallows everything up to the next open item, potentially in a different section. Anchoring on the next heading or entry _title_ does the same. The `##` and EOF terminators are what stop that, and why this rule does not care what order the sections are in.

3. **Verify the count.** Open items before minus one equals open items after. This is the only thing that reliably catches an over-broad delete.
4. **Repoint anything that referenced it** — "see the item above", and comments in the codebase pointing at a tracked item.
5. **Say what was dropped and why**, so it can be reinstated from the transcript.

This mode exists because it went wrong: a "remove one idea" edit anchored on the following entry's title and deleted four unrelated entries with it, including one that a comment in `src/app/privacy/page.tsx` still pointed at.

## Adding a new item

First, read `TODO.md` and check whether a similar item already exists in any section. **If one does:** do not create a second. If the new request adds meaningful detail the existing item lacks, fold it in concisely. Either way, tell the user what you found and what changed.

### Picking the section

Two questions, in order.

**1. Is it a confirmed defect?** Broken, not merely improvable. A missing feature is not a bug; neither is a design since decided against. If yes, its home is **Bugs**, not Up Next.

**2. Does it clear the Up Next bar?** Only three things do here, and being a bug is not one of them (a fourth route, an explicit request, is its own mode above):

- It is **already in flight**, or someone is waiting on it.
- It **blocks the current organizing goal** (defined below).
- It is a **promise the site already makes** in user-facing copy or a published policy but cannot honor. Highest urgency of the three: the gap is visible to the person it misleads and invisible to you.

Everything else goes to **Bugs** (if a defect) or **Backlog / Ideas** (if not), as the first entry after the heading. Say which section you picked and why, so a wrong call is easy to correct. Do not modify any section other than the one you are adding to, except when the cap forces a demotion, which touches two.

**If Up Next is at 5, adding a sixth means demoting one.** Say which is leaving, where it went, and why the new one outranks it. If it does not clearly outrank anything there, it does not go in Up Next. **Never expand the cap to avoid the choice.**

**"Blocks the organizing goal"** means blocking whatever goal the Up Next preamble in `TODO.md` currently names in bold — read it from the file, since it changes when met. If the preamble names no goal, this condition is inactive; do not invent one. Blocking requires **both** halves, and the first is the one that gets skipped:

1. **Someone who is not the owner hits it.** Anything behind the `canEdit` check does not qualify, however badly it behaves.
2. **It would delay sharing the site.** Broken, embarrassing, or a dead end — not merely rough. A sluggish animation, a search wanting an accent typed, or a tight-but-usable layout all fail this.

### Writing the entry

**Do not paste their words in as a one-liner.** Before writing, confirm in the codebase what is actually true: the file and symbol concerned, whether the described behavior is current, whether a related feature already exists. Then write for someone who has forgotten this conversation:

- **Lead with the ask** in bold, in the user's terms.
- **Correct the premise if it is wrong**, saying what the code actually does. The single most valuable thing an entry carries.
- **Name what makes it harder than it looks** — the constraint, the coupling, what breaks if done naively. If it is genuinely a one-liner, say that; a short entry beats invented complexity.
- **Record the counter-argument** when there is a real trade-off, so it can be re-decided rather than re-litigated.
- **Cross-reference related items** by name.

A few sentences to a short paragraph. `<br>` separates sub-points. Match the density of entries already in the file. Keep the user's own words for the _want_, but never preserve a factual claim you checked and found wrong — correct it in the entry and say so when reporting back.

### How much to research, and how to cite it

Write for a **product engineer**: the entry owns the product decision, the implementer owns the implementation. What earns space is what an implementer would have to _decide_ rather than _look up_ — the product change hiding inside a bug fix, the choice with two defensible answers, the premise correction. Diagnosis alongside that is welcome; more information is not inherently bad. **Where to stop:** do not read a file to add a detail the implementer will have open anyway. A walkthrough of how existing code works does not go in.

**Cite symbols, never line numbers.** Checked 2026-08-07: of 22 `file.ts:line` refs in the open sections, **12 were wrong** — one refactor branch invalidated eleven at once, on entries written the day before, while every prose diagnosis in those same entries was still correct. Only the anchors rot, and an implementer greps for the symbol anyway.

- Write `` `pipeline.ts`'s `passesBaseFilters` ``, not `` `pipeline.ts:27` ``.
- Name the function, component, constant, CSS class, or column. With no symbol to name, quote the distinctive line of code — a greppable string outlives a number.
- File paths alone are fine. It is the `:NN` that is banned.

**Mark speculation as speculation.** A diagnosis from reading code is not one confirmed by running it, and stating a guess in the same voice as a verified fact sends the implementer down a path without telling them it was a guess. Write "most likely X, confirm before fixing" rather than "fix by doing X" when you have not reproduced the problem. Bugs reported from a device you cannot test on are almost always this case.
