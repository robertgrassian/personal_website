## Removing an item

"Drop that", "we don't need that anymore". Deleting an entry decided against is normal, and distinct from correcting one that has gone stale.

1. **Identify exactly one entry** and say which before removing it. If more than one plausibly matches, ask.
2. **Delete its detail doc** with `rm docs/todo/<slug>.md`, if it has one. The filesystem bounds this: a file delete cannot reach a neighbouring entry.
3. **Remove its index entry and nothing else.** An index entry is its `- [` line plus the indented continuation lines under it, ending at whichever comes **first**: the next line-initial `- [` (either `- [ ]` or `- [x]`), the next `##` heading, or EOF.

   **All three terminators matter.** `- [x]` should not exist (completed work is deleted, not checked off), but it turns up as drift, and watching only for `- [ ]` then swallows everything up to the next open item, potentially in a different section. Anchoring on the next heading or entry _title_ does the same. The `##` and EOF terminators are what stop that, and why this rule does not care what order the sections are in.

4. **Verify the count.** Open items before minus one equals open items after. This is the only thing that reliably catches an over-broad delete.
5. **Repoint anything that referenced it** — cross-references by name in the index, "see the item above" inside other docs, and comments in the codebase pointing at a tracked item. `grep -rn "<name>" TODO.md docs/todo/ src/ api/` finds all four.
6. **Say what was dropped and why**, so it can be reinstated from the transcript.

**Do not skip step 4.** The doc is behind a `rm`, which cannot over-delete, but the index line is still a range edit in a shared file, and an over-broad one has taken four unrelated entries with it before.
