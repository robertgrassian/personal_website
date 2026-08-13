#!/usr/bin/env bash
#
# PreToolUse(Bash) hook: grade the comments a pending commit would add.
#
# Claude writes long comments. This asks a cheap model whether the comment lines
# in the about-to-be-committed diff can be shortened without losing information,
# and blocks the commit once with the specifics if so. Blocking (exit 2) is what
# gets the feedback in front of Claude: stdout from a hook is informational,
# stderr on exit 2 is fed back as something to act on.
#
# Design rules this follows, because a nagging hook gets switched off:
#   - It fires at most once per distinct set of comments (see the fingerprint
#     below), so "no, these comments are right" is expressed by simply
#     committing again.
#   - It fails OPEN. No jq, no network, no API credit, model unsure: commit.
#   - It never calls the model unless there is a meaningful amount of comment
#     text to judge.
set -uo pipefail

MODEL="haiku"
MIN_CHARS=200 # below this, not worth a model call
STATE_DIR="${TMPDIR:-/tmp}/claude-comment-brevity"

payload=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0

# Whole-word "git commit" anywhere in the command, so `git add -A && git commit`
# is caught but `git commit-tree` and a filename containing the words are not.
[[ "$cmd" =~ (^|[\;\&\|\(]|[[:space:]])git[[:space:]]+commit([[:space:]]|$) ]] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Source files only. Markdown is excluded on purpose: TODO.md entries are
# supposed to be long, and this hook would fight the proj-todo skill.
globs=('*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.css' '*.sql')

diff=$(git diff --cached -U0 -- "${globs[@]}" 2>/dev/null)
if [[ -z "$diff" ]]; then
  # Nothing staged yet, which is the normal case: the tool call being checked is
  # usually `git add -A && git commit -m ...`, and PreToolUse runs before the
  # add. So fall back to what that add would stage: tracked edits, then each
  # untracked file rendered as an all-added diff.
  diff=$(git diff HEAD -U0 -- "${globs[@]}" 2>/dev/null)
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    diff+=$'\n'$(git diff --no-index -U0 -- /dev/null "$f" 2>/dev/null)
  done < <(git ls-files -o --exclude-standard -- "${globs[@]}" 2>/dev/null)
fi
[[ -n "$diff" ]] || exit 0

# Added lines that open with a comment marker. Deliberately a grep and not a
# parser: a stray match (a CSS id selector, a # inside a Python string) costs
# one extra line of context for the grader, where a parser per language would
# cost a dependency.
comments=$(printf '%s\n' "$diff" | grep -E '^\+[[:space:]]*(//|/\*|\*|#)' | sed 's/^+//')
[[ ${#comments} -ge $MIN_CHARS ]] || exit 0

# Fire once per distinct comment payload. Shortening the comments changes the
# fingerprint and earns a fresh check; re-running the identical commit does not,
# which is how a disagreement with the grader gets resolved without a fight.
fingerprint=$(printf '%s' "$comments" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1)
mkdir -p "$STATE_DIR" 2>/dev/null
[[ -e "$STATE_DIR/$fingerprint" ]] && exit 0
# Prune anything older than a day so this does not grow forever.
find "$STATE_DIR" -type f -mtime +1 -delete 2>/dev/null

instructions=$(
  cat <<'PROMPT'
You are grading code comments for length, for a codebase whose owner finds
Claude's comments too long. Below are the comment lines a pending commit adds.

The bar: a comment earns its length by carrying information the code does not.
Reasons, constraints, corrected assumptions, why an obvious alternative was
rejected: all of that stays, however long. What does NOT earn space is
restating the code in English, preamble, hedging, repeating one point in two
sentences, and words that could be deleted with no loss of meaning.

Be strict about noise and generous about substance. A dense ten-line comment
explaining a real constraint is GOOD. A three-line comment saying what the
function obviously does is not.

Answer with exactly "OK" and nothing else if every comment here is already
carrying its weight. That is the expected answer most of the time.

Otherwise list at most three of the worst offenders. For each: one line quoting
enough text to locate it, then one line naming what to cut. No preamble, no
closing summary. Keep the whole reply under 120 words.

COMMENT LINES ADDED BY THIS COMMIT:
PROMPT
)

verdict=$(printf '%s\n%s\n' "$instructions" "$comments" |
  timeout 45 claude -p --model "$MODEL" \
    --allowedTools "" \
    --settings '{"disableAllHooks":true}' 2>/dev/null)

# Fail open: no answer, an error, or a pass all mean commit.
[[ -z "$verdict" ]] && exit 0
[[ "$verdict" =~ ^[[:space:]]*OK ]] && exit 0

: >"$STATE_DIR/$fingerprint"
cat >&2 <<EOF
Comment brevity check ($MODEL) on the comments this commit adds:

$verdict

Shorten what you agree with and commit again. If you think these comments are
already right, commit again unchanged and this will not ask twice.
EOF
exit 2
