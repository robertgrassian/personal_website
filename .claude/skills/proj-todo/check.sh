#!/usr/bin/env bash
# Structure check for the todo backlog. Run from the repo root.
#   ./.claude/skills/proj-todo/check.sh [cap]
# Prints one line per problem and nothing at all when the backlog is clean.
# Exits 1 if anything was reported, 0 if clean.
set -uo pipefail

CAP="${1:-350}"
found=0
report() {
	found=1
	printf '%s\n' "$1"
}

# An index entry links to a file that does not exist. Matches the markdown link
# target rather than any mention of the path, so prose like `docs/todo/<slug>.md`
# is not treated as a link. The slug pattern inside is deliberately loose: this
# check exists to catch edits made outside the skill, which is exactly where a
# non-conforming slug comes from.
while read -r p; do
	[ -n "$p" ] || continue
	[ -f "$p" ] || report "DEAD LINK: $p"
done < <(grep -o '](docs/todo/[^)]*)' TODO.md | sed 's/^](//; s/)$//' | sort -u)

# A file in docs/todo/ that no index entry links to. Matches any extension:
# the invariant is one file per doc-backed item and nothing else.
for f in docs/todo/*; do
	[ -f "$f" ] || continue
	grep -qF "docs/todo/$(basename "$f")" TODO.md || report "ORPHAN: $f"
done

# Index entries over the character cap, counting continuation lines, because a
# single unwrapped line can be 950 chars and still look short.
while read -r line; do
	[ -n "$line" ] && report "$line"
done < <(awk -v cap="$CAP" '
	function flush() { if (n && c > cap) printf "OVER CAP (%d): %s\n", c, substr(t, 1, 60) }
	/^- \[/ { flush(); t = $0; n = 1; c = length($0); next }
	/^## /  { flush(); n = 0; next }
	n && NF { c += length($0) }
	END     { flush() }
' TODO.md)

exit $found
