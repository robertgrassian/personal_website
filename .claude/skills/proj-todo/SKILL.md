---
name: proj-todo
description: "The rules for the project backlog and bug list in TODO.md and docs/todo/ (not the in-session task tracker). Use when adding, promoting, reorganizing or removing a backlog item, or when asked what to work on next."
argument-hint: "[what you want to do]"
---

Rules for the backlog. Reading `TODO.md` to answer a question or to check for an existing entry
needs none of this, and must not leave a diff.

## Layout

- **`TODO.md` is the index.** Every open item appears exactly once, under its section. An entry is
  the ask in bold, the corrected premise or the constraint that decides the approach,
  cross-references to related items by name, and an optional `[Details](docs/todo/<slug>.md)` link.
- **`docs/todo/<slug>.md` is one item's detail**: diagnosis, rejected alternatives, design
  decisions. It opens with the ask as an H1 and a
  `_Section: **<section>** &middot; index: [`TODO.md`](../../TODO.md)_` line. Uncapped. Read one
  when working on its item, not to survey the backlog.
- **Invariant:** `docs/todo/` holds exactly one file per doc-backed open item. After any write, run
  `./.claude/skills/proj-todo/check.sh` from the repo root. Silence means clean; it reports dead
  links, orphaned docs and index entries over 350 characters.
- **Completed work is not tracked.** Finishing or dropping an item deletes its index entry and its
  doc, and repoints anything that named it (`TODO.md`, `docs/todo/`, comments in `src/` and
  `api/`). `git log` is the record. Work that only partly covers an entry is an edit: rewrite the
  entry to describe what remains.

## Sections

- **Up Next**: the queue, **hard cap of 5**. Adding a sixth means demoting one; say which and why.
  Never raise the cap.
- **Bugs**: confirmed defects (broken, not merely improvable) that have not cleared the Up Next
  bar. Roughly severity-ordered.
- **Backlog / Ideas**: everything else, newest first.

**What gets into Up Next.** Being a bug is not enough. An item qualifies only if it is:

1. already in flight, or someone is waiting on it;
2. blocking the organizing goal named in bold in the Up Next preamble, meaning someone who is not
   the owner hits it and it would delay sharing the site; or
3. a promise the site already makes in user-facing copy but cannot honor. This is the most urgent.

An explicit request ("I want to do X next") needs no reason: put it at the top and mark it
`(Promoted by request YYYY-MM-DD.)` right after the bold ask. Never demote a marked item without
asking.

## Writing an entry

- **Check for an existing entry first** and fold new detail into it rather than adding a second.
  If more than one entry plausibly matches a request, ask.
- **Verify the premise in the code before writing.** Lead with the ask in the user's terms, then
  correct the premise if it is wrong: that correction is the most valuable thing an entry carries.
  Name what makes the item harder than it looks, and record the counter-argument when there is a
  real trade-off.
- **Aim for one line of about 150 characters; 350 is the cap.** An entry that needs more gets a
  detail doc; a cross-reference is the one thing worth going over the cap for. Short items have no
  doc.
- **Cite symbols, never line numbers** (`pipeline.ts`'s `passesBaseFilters`, not `pipeline.ts:27`).
- **Mark speculation as speculation**: "most likely X, confirm before fixing" when the problem was
  not reproduced.
- Say which section you picked and why.

## What to work on next

Answer from the index alone. Recommend one thing from Up Next rather than listing options, then
give one line on Bugs (how many, and the worst).
