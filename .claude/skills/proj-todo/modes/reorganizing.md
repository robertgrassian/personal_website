## Reorganizing

"Fix the todo list", "clean this up", or a change to the rules themselves (the cap, the sections, what belongs where).

Run the full structure check (`modes/structure-check.md`), since this is a write. Then do what was asked, usually one of:

- **Items in the wrong section**, which is an index edit plus the doc's `_Section:_` line.
- **A rule change.** If the user changes a rule in this file, edit this file too, not just `TODO.md`. A rule followed once and not written down will not survive the session.
- **Entries that have gone stale.** Correct them rather than deleting, and say what changed.
- **Index lines that have outgrown five lines**, which is the signal to give that item a doc. Move the overflow rather than trimming the meaning out of it.
- **Dead links and orphaned docs**, per the invariant check above.

This is the only mode that may read detail docs broadly, and even here read them because something looks wrong, not to survey them.

Report what moved and why in two lines. This is the one mode where the user cannot see the result at a glance.
