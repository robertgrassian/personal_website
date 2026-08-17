## Check the file's structure (write modes)

You are here because SKILL.md routed a write mode to this file; read-only modes skip it entirely and never reach this text. Fix what is below silently, mentioning only what moved non-obviously.

The drift to look for:

1. **A stray `- [x]` item in `TODO.md`** means someone marked something done instead of deleting it. Confirm it shipped, then remove the line and `rm` its doc.
2. **Fix cross-references broken by a removal.** An open item naming an item that is gone needs repointing. Cross-references live in the index by item name, so this is a `TODO.md` edit; also grep `docs/todo/` for the removed item's name.
3. **Prune stale framing** in section headers and open items — a note saying work is blocked on something that has since shipped is worse than no note.
4. **Enforce the Up Next cap of 5.** Rank the excess by the admission test, move the weakest to **Bugs** if it is a defect and **Backlog / Ideas** otherwise. Say what moved and why; never demote silently. **Never auto-demote an item marked `Promoted by request`** — if every candidate is pinned, ask. **Demote, never delete**; only `.claude/skills/proj-todo/modes/removing.md` deletes.
5. **A confirmed defect in Backlog / Ideas belongs in Bugs**, unless it is in Up Next. Ideas about how something _could_ work are not defects. When genuinely ambiguous, leave it rather than churning the file. Moving an item between sections is an index edit; its doc does not move, but the `_Section:_` line at the top of the doc needs updating.
6. **Run the structure check script**, which catches an edit that touched one file and not the other, plus entries over the cap:

   ```
   ./.claude/skills/proj-todo/check.sh
   ```

   Silence means clean. `DEAD LINK` means the doc was deleted but its index entry stayed: restore the doc from git history, or fold its content back into the index line. `ORPHAN` means an item was removed and its doc was left behind: delete it. `OVER CAP` (350 characters, write modes only) means that entry has outgrown the index and wants a doc: act on it when it is an entry you are already editing, and never split more than two per pass. In a read-only mode, report all three rather than fixing them.

   **A cross-reference always beats the cap.** If naming the item this one blocks pushes it over, go over: routing and ranking are what the index is for, and an entry that fits but hides a dependency has failed at its job.
