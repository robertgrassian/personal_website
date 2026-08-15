---
name: proj-todo
description: "Owns the project backlog AND the tracked bug list, both in TODO.md at the repo root — NOT the in-session task tracker (TaskCreate/TaskUpdate), which is unrelated. Invoke for every interaction with that file, reads included: 'add to my todos', 'what should I work on next', 'mark X done', 'is X on my list?', 'drop that item', 'clean up the todo list', and any time you would otherwise read or edit TODO.md yourself. Bugs live in that file too, so invoke it before hunting for defects in the codebase: 'what bugs are open', 'find me a low-hanging-fruit bug to fix', 'what should I fix next', 'is that bug written down', 'file a bug for X' — a request to fix or find a bug starts here, not with a code search. ALSO invoke at the START of any request to build, change, fix, refactor or add anything in this project, even when the user never mentions the todo list and even when the request looks small — 'can you make X do Y', 'add a Z', 'this should really do W'. Whatever was asked for is very often already an entry, carrying a corrected premise, a rejected approach or a collision with another item, and it has to be closed out once the work lands. Check first, implement second."
argument-hint: "[what you want to do]"
disable-model-invocation: false
---

**Work out what was meant from the request itself. There is no command syntax to parse.** The user talks to this skill in ordinary language, whether they typed `/todo` or just said something in passing, so route on intent:

| What they want                                   | Section                         |
| ------------------------------------------------ | ------------------------------- |
| Build / change / fix something, todo unmentioned | Checking before you build       |
| Consult the list, or you need its contents       | Reading or answering a question |
| Pick something to work on                        | What to work on next            |
| Find a bug to fix, or see what is broken         | Reading or answering a question |
| A quick overview                                 | Showing the list                |
| Something is finished                            | Marking done                    |
| Do one of the items now                          | Implementing a task             |
| Capture something new                            | Adding a new item               |
| Move an item to Up Next                          | Promotion by request            |
| Drop an item no longer wanted                    | Removing an item                |
| Reorganize, prune, fix the file                  | Reorganizing                    |

Keyword prefixes like "done" or "list" are a hint, never a rule: "the wishlist thing is done" is a completion, and "add a todo to list the systems on each shelf" is a new item despite both words appearing. When the request genuinely fits two sections, prefer the non-destructive one and say what you assumed. A bare invocation with nothing after it means show the list.

**The three open sections**, since almost every decision below depends on them:

- **Up Next** — the queue, admission rules under "Adding a new item". **Hard cap of 5**, enforced on every write. An uncapped queue is just a backlog with a better name.
- **Bugs** — every confirmed defect that has not cleared the Up Next bar. Roughly severity-ordered, uncapped.
- **Backlog / Ideas** — everything else. Newest first, no other ordering guarantee.

Bugs was split out from Up Next on 2026-08-07: the old rule admitted any "confirmed bug", so four of five slots were defects and nothing was ever demoted. Do not merge them back.

**Index order is Up Next, Bugs, Backlog / Ideas, then Recently Completed** — open work first, the archive last. Set 2026-07-30; do not "fix" it back. Recently Completed is now a one-line pointer to `docs/todo/completed.md`; keep the heading so the order still reads. Every rule below finds its section by heading name, never by position.

## How the backlog is laid out

Split 2026-08-15, because `TODO.md` had reached 16k words and this skill reads it on nearly every turn — including every build request, per "Checking before you build". Three kinds of file:

- **`TODO.md` is the index.** Every open item appears here exactly once, under its section heading. An index entry is its ask in bold, the corrected premise or the constraint that decides the approach, its cross-references by name, and, if it has one, a `[Details](docs/todo/<slug>.md)` link. **This is the only file most modes need.**
- **`docs/todo/<slug>.md` is one open item's detail** — the diagnosis, the rejected alternatives, the design decisions. Uncapped in length. Items short enough to say in the index have no doc at all, and roughly half do not.
- **`docs/todo/completed.md` is the archive**, newest first, capped at 20.

**The invariant, which makes drift checkable:** `docs/todo/` holds exactly one file per doc-backed open item, plus `completed.md`. Every `[Details]` link resolves; every doc is linked from the index.

**Read detail docs on demand, never by default.** Open one when you are about to work on that item, cross-reference it, or check whether a new request duplicates it. Reading them all rebuilds the problem this split exists to solve. The index carries the premise correction precisely so that routing, duplicate checks and "is X on my list?" can be answered without opening anything.

## Check the file's structure

Do this after deciding the mode, before acting. TODO.md gets edited outside this skill too, so this is where drift gets caught.

- **Writing anyway** (marking done, implementing, adding, promoting, reorganizing): fix drift silently, mentioning only what moved non-obviously.
- **Read-only** (answering a question, what to work on next, showing the list): **do not modify the file.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch. Mention what is out of place at the end and offer to fix it.

The drift to look for:

1. **Any `- [x]` item in `TODO.md`** moves to the top of `docs/todo/completed.md`. Compress while moving: keep what stays useful as reference (a debugging gotcha, an accepted trade-off, a follow-up someone will need), drop the planning detail that only mattered while it was pending. **Then delete its detail doc**, folding anything still useful into the completed entry first. The doc holds planning detail, which is exactly what this rule drops.
2. **Fix cross-references broken by the move.** An open item saying "see the gotcha above" needs repointing once that text moves. Cross-references live in the index by item name, so this is a `TODO.md` edit; also grep `docs/todo/` for the moved item's name.
3. **Trim `docs/todo/completed.md` to 20 entries**, oldest first. Before dropping one, check whether it carries reference material cited elsewhere; if so, fold that detail into the citing item.
4. **Prune stale framing** in section headers and open items — a note saying work is blocked on something that has since shipped is worse than no note.
5. **Enforce the Up Next cap of 5.** Rank the excess by the admission test, move the weakest to **Bugs** if it is a defect and **Backlog / Ideas** otherwise. Say what moved and why; never demote silently. **Never auto-demote an item marked `Promoted by request`** — if every candidate is pinned, ask. **Demote, never delete**; only "Removing an item" deletes.
6. **A confirmed defect in Backlog / Ideas belongs in Bugs**, unless it is in Up Next. Ideas about how something _could_ work are not defects. When genuinely ambiguous, leave it rather than churning the file. Moving an item between sections is an index edit; its doc does not move, but the `_Section:_` line at the top of the doc needs updating.
7. **Check the index/doc invariant**, which is two greps and catches an edit that touched one file and not the other:

   ```
   grep -o 'docs/todo/[a-z0-9-]*\.md' TODO.md | sort -u | while read p; do [ -f "$p" ] || echo "DEAD LINK: $p"; done
   for f in docs/todo/*.md; do b=$(basename "$f"); [ "$b" = completed.md ] && continue; grep -q "docs/todo/$b" TODO.md || echo "ORPHAN: $f"; done
   ```

   A dead link means the doc was deleted but its index entry stayed: restore the doc from git history, or fold its content back into the index line. An orphan means an item was removed or completed and its doc was left behind: delete it. In a read-only mode, report both rather than fixing them.

## Checking before you build

**Any request to build, change or fix something in this project, whether or not the todo list is mentioned.** The user asks for a feature in ordinary language and does not think of it as a todo interaction; this section exists because it usually is one.

**Do this before writing code, not after.**

1. **Read the `TODO.md` index and look for an entry covering the ask**, across all three open sections. Match on subject, not wording: "make rating edits ask for a confirm" and "Editing a game should need a 'Confirm' press before the change takes effect" are the same item. The index alone is enough to decide this.
2. **If one exists, open its detail doc and say so before starting.** This is the mode docs exist for. They carry a corrected premise, an approach already rejected with reasons, and the other items the work collides with; re-deriving that from the code throws the work away. A doc that names a decision ("decide whether Confirm covers the whole dialog or just the rating") is telling you what the user will be asked to weigh in on. An entry with no `[Details]` link has nothing more to give: the index line is the whole item.
3. **Implement, then mark it done in the same pass** — see "Marking done". An open entry describing shipped work is worse than no entry: it sends a later session to redo finished work, and its stale premise ("the rating writes on click") gets quoted as current by every item that cross-references it.
4. **If the work only partly covers the entry, say which part is left** rather than closing it silently or leaving it wholly open. Record the deliberate non-goals in the completed entry, so a later session reads them as answers rather than oversights.
5. **If nothing matches, just do the work.** Do not file an entry for something you are about to finish; "Adding a new item" is for work that is _not_ being done now.

The cost is one index read on requests that turn out to be unrelated, which is the trade this rule accepts on purpose. It got a lot cheaper on 2026-08-15: the index is a fifth of what the file used to be, and the detail doc is only opened once an entry actually matches. Added 2026-08-15, after the rating-confirm work was implemented from scratch while a fully written-up entry for it sat in Backlog / Ideas, and stayed open afterwards.

## Reading or answering a question

Any request to consult the TODO that is not "what should I work on" or a request for the whole list. Also use this when _you_ need the file's contents to answer something.

Read the `TODO.md` index, answer, quote or summarize only the relevant entries. **Read-only: do not edit anything.** Open a detail doc only when the question genuinely turns on something the index does not carry, and say which one you opened. "Is X on my list?", "what bugs are open" and "what is that item about" are all index-only questions.

Two things worth doing while you have it open, since the user cannot see them from a summary:

- If an entry's premise has gone stale (it describes behavior that has since changed, or cites a file that has moved), say so rather than repeating it as current.
- If the answer is "not on the list", say so plainly and offer to add it, rather than stretching a loosely-related item to fit.

## What to work on next

**Answer from the `TODO.md` index alone — do not open detail docs, and do not explore the codebase.** The index carries each item's premise and its cross-references, which is what ranking needs. Summarize **Up Next** and recommend one thing to start with. Give a recommendation, not a menu: if items block each other, order them; if something is cheap now and expensive later, lead with it. Note when an item's stated blocker has cleared.

**Read Bugs too, but lead with Up Next.** Close with one line on the bug list ("three open bugs, worst is X") rather than merging the two into one ranked list. If a bug has become urgent enough to lead with, say so and offer to promote it rather than recommending it from where it sits.

## Showing the list

Read the `TODO.md` index in full. No detail docs: this mode is a scan, not a study. Then give two short groups:

1. **Three you'd recommend**, each with a one-line reason. Weigh what unblocks other work, what is cheap now and expensive later, and what the user would enjoy building. Say why you picked.
2. **Three most recently added** — the top three in Backlog / Ideas, where new items land.

Then one line for **Bugs**: how many, and the worst. Keep it scannable; summarize long sections rather than dumping them.

## Marking done

Identify which task from what they said, matching on description across all sections of the index. Flip it to `- [x]`; the structure check then moves it to `docs/todo/completed.md`, compresses it, deletes its detail doc and caps the archive.

**Read the detail doc before deleting it**, so anything still useful as reference survives into the compressed entry. This is the one write path that destroys information, and it is the only reason to open a doc in this mode.

If nothing matches, say so rather than guessing — it may never have been written down, in which case offer to add it as already-done.

## Implementing a task

Find the best-matching `- [ ]` item in the index. If no match, say so and stop.

1. **Open its detail doc if it has one, before writing any code.** Same reason as "Checking before you build": the rejected alternatives are in there, and re-proposing one is the failure this costs a single file read to avoid.
2. Implement it — read whatever files are needed, make the changes, explain what you did.
3. Immediately after writing the changes, mark it done: remove the index entry, add it as `- [x]` at the top of `docs/todo/completed.md`, and delete the detail doc.

Do **not** ask whether the changes look good before marking done. Applying them is sufficient.

**Size the approach first, though.** Some entries describe a directory move plus a redirect plus five call-site edits. For anything touching more than a couple of files, say what you intend to do and confirm before starting, then implement and mark done without a second check. The no-confirmation rule is about not seeking reassurance on finished work, not about skipping a plan on work with real blast radius.

## Promotion by request

**"I want to do X next" puts X in Up Next, full stop.** No test applies and no justification is needed — wanting to build the fun thing on a Saturday is a complete reason. Covers "move X to up next", "bump X up", "X is what I'm doing next", from Bugs or Backlog, to the **top** of Up Next unless told otherwise.

**Mark it on the index entry's first line: `(Promoted by request YYYY-MM-DD.)`** Without the marker the cap rule ranks it weakest by the objective test and evicts it on the next write, silently undoing the decision. It goes in the index, not the doc, because the cap rule never opens docs. Update the `_Section:_` line in the doc too, if it has one.

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
- **Index lines that have outgrown five lines**, which is the signal to give that item a doc. Move the overflow rather than trimming the meaning out of it.
- **Dead links and orphaned docs**, per the invariant check above.

This is the only mode that may read detail docs broadly, and even here read them because something looks wrong, not to survey them.

Report what moved and why in two lines. This is the one mode where the user cannot see the result at a glance.

## Removing an item

"Drop that", "we don't need that anymore". Deleting an entry decided against is normal, and distinct from correcting one that has gone stale.

1. **Identify exactly one entry** and say which before removing it. If more than one plausibly matches, ask.
2. **Delete its detail doc** with `rm docs/todo/<slug>.md`, if it has one. The filesystem bounds this: a file delete cannot reach a neighbouring entry.
3. **Remove its index entry and nothing else.** An index entry is its `- [` line plus the indented continuation lines under it, ending at whichever comes **first**: the next line-initial `- [` (either `- [ ]` or `- [x]`), the next `##` heading, or EOF.

   **All three terminators matter.** Watching only for `- [ ]` skips over any run of `- [x]` entries and swallows everything up to the next open item, potentially in a different section. Anchoring on the next heading or entry _title_ does the same. The `##` and EOF terminators are what stop that, and why this rule does not care what order the sections are in.

4. **Verify the count.** Open items before minus one equals open items after. This is the only thing that reliably catches an over-broad delete.
5. **Repoint anything that referenced it** — cross-references by name in the index, "see the item above" inside other docs, and comments in the codebase pointing at a tracked item. `grep -rn "<name>" TODO.md docs/todo/ src/ api/` finds all four.
6. **Say what was dropped and why**, so it can be reinstated from the transcript.

This mode exists because it went wrong: a "remove one idea" edit anchored on the following entry's title and deleted four unrelated entries with it, including one that a comment in `src/app/privacy/page.tsx` still pointed at. **The index/doc split shrinks that blast radius but does not close it** — the detail is now behind a `rm`, which cannot over-delete, while the index line is still a range edit in a shared file. Step 4 is what catches it, so do not skip it on the grounds that the docs made things safer.

## Adding a new item

First, read the `TODO.md` index and check whether a similar item already exists in any section. The index carries each item's corrected premise for exactly this reason, so the scan is index-only; open a candidate's detail doc **only** when it looks like a real match and you need to know whether the new request is already covered. **If one does exist:** do not create a second. If the new request adds meaningful detail the existing item lacks, fold it in: into the doc if it has one, into the index line if it does not. Either way, tell the user what you found and what changed.

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

Keep the user's own words for the _want_, but never preserve a factual claim you checked and found wrong — correct it in the entry and say so when reporting back.

### Where the words go, and the only length rule that matters

**The index line is capped at about five lines. The detail doc is not capped at all.** Before the split this cap did not exist and entries grew to sixty lines each, which is what made the file too expensive to read.

- **If the item fits in five lines, it has no doc.** Roughly half do not. A `[Details]` link pointing at three sentences costs more than it saves.
- **If it needs more, write the index line first**, at five lines: the ask, the corrected premise or the deciding constraint, the cross-references. Then put everything else in `docs/todo/<slug>.md` and link it. The index line is not a teaser, it is the item as a product engineer needs to route it; the doc is what an implementer needs to build it.
- **`<br>` separates sub-points in an index line.** In a doc, use real paragraphs and `_italic lead-ins_` for sub-points, matching the docs already there.
- **Slugs are short and readable** (`genre-vocabulary-audit`, not the ask verbatim). The filename is read far more often than it is written.

Growing an item past five index lines later is the signal to give it a doc, not to let the index line grow.

### How much to research, and how to cite it

Write for a **product engineer**: the entry owns the product decision, the implementer owns the implementation. What earns space is what an implementer would have to _decide_ rather than _look up_ — the product change hiding inside a bug fix, the choice with two defensible answers, the premise correction. Diagnosis alongside that is welcome; more information is not inherently bad. **Where to stop:** do not read a file to add a detail the implementer will have open anyway. A walkthrough of how existing code works does not go in.

**Cite symbols, never line numbers.** Checked 2026-08-07: of 22 `file.ts:line` refs in the open sections, **12 were wrong** — one refactor branch invalidated eleven at once, on entries written the day before, while every prose diagnosis in those same entries was still correct. Only the anchors rot, and an implementer greps for the symbol anyway.

- Write `` `pipeline.ts`'s `passesBaseFilters` ``, not `` `pipeline.ts:27` ``.
- Name the function, component, constant, CSS class, or column. With no symbol to name, quote the distinctive line of code — a greppable string outlives a number.
- File paths alone are fine. It is the `:NN` that is banned.

**Mark speculation as speculation.** A diagnosis from reading code is not one confirmed by running it, and stating a guess in the same voice as a verified fact sends the implementer down a path without telling them it was a guess. Write "most likely X, confirm before fixing" rather than "fix by doing X" when you have not reproduced the problem. Bugs reported from a device you cannot test on are almost always this case.
