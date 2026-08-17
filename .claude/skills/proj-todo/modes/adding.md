## Adding a new item

First, read the `TODO.md` index and check whether a similar item already exists in any section. The index carries each item's corrected premise for exactly this reason, so the scan is index-only; open a candidate's detail doc **only** when it looks like a real match and you need to know whether the new request is already covered. **If one does exist:** do not create a second. If the new request adds meaningful detail the existing item lacks, fold it in: into the doc if it has one, into the index line if it does not. **If the folded detail changes the entry's premise or its deciding constraint, update the index line too** — the index is what every read-only mode sees, so a correction that lands only in the doc leaves routing reading the old, wrong premise. Either way, tell the user what you found and what changed.

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

**The index line is capped at 700 characters. The detail doc is not capped at all.**

- **If the item fits in the cap, it has no doc.** Roughly half do not. A `[Details]` link pointing at three sentences costs more than it saves.
- **If it needs more, write the index line first**, inside the cap: the ask, the corrected premise or the deciding constraint, the cross-references. Then put everything else in the doc. The index line is not a teaser, it is the item as a product engineer needs to route it; the doc is what an implementer needs to build it.
- **`<br>` separates sub-points in an index line.** In a doc, use real paragraphs and `_italic lead-ins_` for sub-points, matching the docs already there.
- **Slugs are short and readable** (`genre-vocabulary-audit`, not the ask verbatim). The filename is read far more often than it is written.

**Creating a detail doc.** It opens with the ask as an H1 and a metadata line, both of which later rules depend on, then the body:

```markdown
# <the ask, verbatim from the index line>

_Section: **<Up Next | Bugs | Backlog / Ideas>** &middot; index: [`TODO.md`](../../TODO.md)_
```

Then add `[Details](docs/todo/<slug>.md)` as the last element of the index line. The `_Section:_` line is what the structure check and `modes/promoting.md` keep in sync, so a doc without it silently opts out of both.

An entry outgrowing the cap is the signal to give it a doc, not to let the index line grow.

### How much to research, and how to cite it

Write for a **product engineer**: the entry owns the product decision, the implementer owns the implementation. What earns space is what an implementer would have to _decide_ rather than _look up_ — the product change hiding inside a bug fix, the choice with two defensible answers, the premise correction. Diagnosis alongside that is welcome; more information is not inherently bad. **Where to stop:** do not read a file to add a detail the implementer will have open anyway. A walkthrough of how existing code works does not go in.

**Cite symbols, never line numbers.** A single refactor invalidates every `file.ts:27` in the backlog while the prose around them still holds. Only the anchors rot, and an implementer greps for the symbol anyway.

- Write `` `pipeline.ts`'s `passesBaseFilters` ``, not `` `pipeline.ts:27` ``.
- Name the function, component, constant, CSS class, or column. With no symbol to name, quote the distinctive line of code — a greppable string outlives a number.
- File paths alone are fine. It is the `:NN` that is banned.

**Mark speculation as speculation.** A diagnosis from reading code is not one confirmed by running it, and stating a guess in the same voice as a verified fact sends the implementer down a path without telling them it was a guess. Write "most likely X, confirm before fixing" rather than "fix by doing X" when you have not reproduced the problem. Bugs reported from a device you cannot test on are almost always this case.
