## Check the file's structure (write modes)

Do this after deciding the mode, before acting. TODO.md gets edited outside this skill too, so this is where drift gets caught.

- **Writing anyway** (marking done, implementing, adding, promoting, reorganizing): fix drift silently, mentioning only what moved non-obviously.
- **Read-only** (answering a question, what to work on next, showing the list, **and checking before you build**): **do not modify anything.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch. Mention what is out of place at the end and offer to fix it. Checking before you build becomes a write mode only at its step 3, once you have actually implemented something; a build request that matches no entry must leave the backlog untouched.

The drift to look for:

1. **A stray `- [x]` item in `TODO.md`** means someone marked something done instead of deleting it. Confirm it shipped, then remove the line and `rm` its doc.
2. **Fix cross-references broken by a removal.** An open item naming an item that is gone needs repointing. Cross-references live in the index by item name, so this is a `TODO.md` edit; also grep `docs/todo/` for the removed item's name.
3. **Prune stale framing** in section headers and open items — a note saying work is blocked on something that has since shipped is worse than no note.
4. **Enforce the Up Next cap of 5.** Rank the excess by the admission test, move the weakest to **Bugs** if it is a defect and **Backlog / Ideas** otherwise. Say what moved and why; never demote silently. **Never auto-demote an item marked `Promoted by request`** — if every candidate is pinned, ask. **Demote, never delete**; only `modes/removing.md` deletes.
5. **A confirmed defect in Backlog / Ideas belongs in Bugs**, unless it is in Up Next. Ideas about how something _could_ work are not defects. When genuinely ambiguous, leave it rather than churning the file. Moving an item between sections is an index edit; its doc does not move, but the `_Section:_` line at the top of the doc needs updating.
6. **Run the structure check script**, which catches an edit that touched one file and not the other, plus entries over the cap:

   ```
   ./.claude/skills/proj-todo/check.sh
   ```

   Silence means clean. `DEAD LINK` means the doc was deleted but its index entry stayed: restore the doc from git history, or fold its content back into the index line. `ORPHAN` means an item was removed and its doc was left behind: delete it. `OVER CAP` is a **watch, not a chore** (write modes only): act on it when an entry you are already editing is over, and never split more than two per pass. In a read-only mode, report all three rather than fixing them.

   **A cross-reference always beats the cap.** If naming the item this one blocks pushes it over, go over: routing and ranking are what the index is for, and an entry that fits but hides a dependency has failed at its job.
