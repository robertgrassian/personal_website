#!/usr/bin/env bash
# Structure check for the todo backlog. Run from the repo root.
#   ./.claude/skills/proj-todo/check.sh [cap]
# Prints one line per problem and nothing at all when the backlog is clean.
set -uo pipefail

CAP="${1:-350}"

# An index entry links to a doc that no longer exists.
grep -o 'docs/todo/[a-z0-9-]*\.md' TODO.md | sort -u | while read -r p; do
	[ -f "$p" ] || echo "DEAD LINK: $p"
done

# A doc exists that no index entry links to.
for f in docs/todo/*.md; do
	[ -e "$f" ] || continue
	grep -q "docs/todo/$(basename "$f")" TODO.md || echo "ORPHAN: $f"
done

# Index entries over the character cap. Counts the whole entry, continuation
# lines included, because a single unwrapped line can be 950 chars and look short.
awk -v cap="$CAP" '
	/^- \[/   { if (n) print "OVER CAP (" c "): " substr(t, 1, 60); t = $0; n = 1; c = length($0); next }
	/^## /    { if (n) print "OVER CAP (" c "): " substr(t, 1, 60); n = 0; next }
	n && NF   { c += length($0) }
	END       { if (n) print "OVER CAP (" c "): " substr(t, 1, 60) }
' TODO.md | awk -F'[()]' '$2 > cap' cap="$CAP"
