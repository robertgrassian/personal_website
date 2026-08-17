---
name: proj-todo
description: "Owns the project backlog and bug list in TODO.md (NOT the in-session TaskCreate/TaskUpdate tracker). Invoke for every interaction with that file, reads included: add an item, what should I work on next, mark X done, is X on my list, drop that item, clean up the list. Open bugs live there too, so a request to find or fix a bug starts here, not with a code search. ALSO invoke at the START of any request to build, change, fix or add anything in this project, even when the todo list is never mentioned and the request looks small: it is very often already an entry carrying a corrected premise or a rejected approach, and it has to be closed out once the work lands. Check first, implement second."
argument-hint: "[what you want to do]"
disable-model-invocation: false
---

**Work out what was meant from the request itself. There is no command syntax to parse.** The user talks to this skill in ordinary language, whether they typed `/todo` or just said something in passing, so route on intent:

| What they want                                    | Where the rules are              |
| ------------------------------------------------- | -------------------------------- |
| Build / change / fix something, todo unmentioned  | Checking before you build, below |
| Consult the list, or you need its contents        | Reading or answering a question  |
| Pick something to work on                         | What to work on next             |
| See what is broken                                | Reading or answering a question  |
| Pick a bug to fix ("find me an easy one")         | What to work on next             |
| A quick overview                                  | Showing the list                 |
| Something is finished                             | Marking done                     |
| Do one of the items now                           | Implementing a task              |
| Capture something new                             | **read `modes/adding.md`**       |
| Move an item to Up Next                           | **read `modes/promoting.md`**    |
| Drop an item no longer wanted                     | **read `modes/removing.md`**     |
| Reword, reorder, or move an item between sections | **read `modes/reorganizing.md`** |
| Reorganize, prune, fix the file                   | **read `modes/reorganizing.md`** |

Paths are relative to this file. **Read exactly the one mode file the request routes to, and only after routing** — they are split out so a turn pays for the mode it uses, not for all of them.

**Delegate the mechanical write modes to the `todo-clerk` subagent** (`modes/removing.md`,
`modes/promoting.md`, `modes/reorganizing.md`, and a structure-check sweep): decide which entry is
meant and what should happen to it, then hand the clerk that decision. It reads the skill itself, so
the mode file never enters this context. Do the rest here. **`modes/adding.md` is never delegated**
— writing an entry means checking its premise against the codebase and choosing its section, which
is the judgment the clerk is explicitly told not to exercise.

Keyword prefixes like "done" or "list" are a hint, never a rule: "the wishlist thing is done" is a completion, and "add a todo to list the systems on each shelf" is a new item despite both words appearing. When the request genuinely fits two sections, prefer the non-destructive one and say what you assumed. A bare invocation with nothing after it means show the list.

**"Next" promotes, "now" implements.** "Let's do the user search one next" is `modes/promoting.md`; "let's build user search" is Implementing a task. Both are writes, so the non-destructive tie-break gives no traction. When it is still unclear, promote and offer to start.

**In every mode, if more than one entry plausibly matches, ask rather than picking.** Genre work in particular spreads across three separate entries, and quietly folding a new request into the wrong one is how two items become one and a real distinction gets lost.

**The three open sections**, since almost every decision below depends on them:

- **Up Next** — the queue, admission rules in `modes/adding.md`. **Hard cap of 5**, enforced on every write. An uncapped queue is just a backlog with a better name.
- **Bugs** — every confirmed defect that has not cleared the Up Next bar. Roughly severity-ordered, uncapped.
- **Backlog / Ideas** — everything else. Newest first, no other ordering guarantee.

Do not merge Bugs back into Up Next: every confirmed bug then lands in the queue and nothing gets demoted.

**Index order is Up Next, Bugs, Backlog / Ideas.** Do not reorder them. Every rule below finds its section by heading name, never by position.

**Completed work is not tracked.** There is no archive file and no `- [x]` state: finishing an item deletes its index line and its doc. `git log` is the record of what shipped.

## How the backlog is laid out

The index is read on nearly every turn, including every build request, so it stays small and the detail lives elsewhere. Two kinds of file:

- **`TODO.md` is the index.** Every open item appears here exactly once, under its section heading. An index entry is its ask in bold, the corrected premise or the constraint that decides the approach, its cross-references by name, and, if it has one, a `[Details](docs/todo/<slug>.md)` link. **This is the only file most modes need.**
- **`docs/todo/<slug>.md` is one open item's detail** — the diagnosis, the rejected alternatives, the design decisions. Uncapped in length. Roughly half of all items are short enough to need no doc at all.

**The invariant, which makes drift checkable:** `docs/todo/` holds exactly one file per doc-backed open item, and nothing else. Every `[Details]` link resolves; every doc is linked from the index.

**Read detail docs on demand, never by default** — each mode below says whether it may. Reading them all rebuilds the problem this split exists to solve.

## Check the file's structure

After deciding the mode, before acting. TODO.md gets edited outside this skill too, so this is where drift gets caught.

- **Read-only modes** (answering a question, what to work on next, showing the list, **and checking before you build**): **skip the check entirely and do not modify anything.** A read must not leave a diff in the working tree — the user may be mid-change on an unrelated branch. If drift is obvious from what you already read, mention it at the end and offer to fix it. Do not read `modes/structure-check.md` and do not run the script.
- **Write modes** (marking done, implementing, adding, promoting, reorganizing): **read `modes/structure-check.md`** and fix what it lists, mentioning only what moved non-obviously.

## Checking before you build

**Any request to build, change or fix something in this project, whether or not the todo list is mentioned.** The user asks for a feature in ordinary language and does not think of it as a todo interaction; this section exists because it usually is one.

**Do this before writing code, not after.**

1. **Read the `TODO.md` index and look for an entry covering the ask**, across all three open sections. Match on subject, not wording: "make rating edits ask for a confirm" and "Editing a game should need a 'Confirm' press before the change takes effect" are the same item. The index alone is enough to decide this.
2. **If one exists, open its detail doc and say so before starting.** This is the mode docs exist for. They carry a corrected premise, an approach already rejected with reasons, and the other items the work collides with; re-deriving that from the code throws the work away. A doc that names a decision ("decide whether Confirm covers the whole dialog or just the rating") is telling you what the user will be asked to weigh in on. An entry with no `[Details]` link has nothing more to give: the index line is the whole item.
3. **Implement, then mark it done in the same pass** — see "Marking done". An open entry describing shipped work is worse than no entry: it sends a later session to redo finished work, and its stale premise ("the rating writes on click") gets quoted as current by every item that cross-references it.
4. **If the work only partly covers the entry, say which part is left.** Partial completion is an **edit, not a removal**: the item stays open, and you rewrite the index line and the detail doc to describe only what remains, recording what shipped and what was deliberately not done so a later session reads those as answers rather than oversights.
5. **If nothing matches, just do the work.** Do not file an entry for something you are about to finish; `modes/adding.md` is for work that is _not_ being done now.

The cost is one index read on requests that turn out to be unrelated, which is the trade this rule accepts on purpose.

## Reading or answering a question

Any request to consult the TODO that is not "what should I work on" or a request for the whole list. Also use this when _you_ need the file's contents to answer something.

Read the `TODO.md` index, answer, quote or summarize only the relevant entries. **Read-only: do not edit anything.** Open a detail doc only when the question genuinely turns on something the index does not carry, and say which one you opened. "Is X on my list?", "what bugs are open" and "what is that item about" are all index-only questions.

Two things worth doing while you have it open, since the user cannot see them from a summary:

- If an entry's premise has gone stale (it describes behavior that has since changed, or cites a file that has moved), say so rather than repeating it as current.
- If the answer is "not on the list", say so plainly and offer to add it, rather than stretching a loosely-related item to fit.

## What to work on next

**Answer from the `TODO.md` index alone — do not open detail docs, and do not explore the codebase.** The index carries each item's premise and its cross-references, which is what ranking needs. Summarize **Up Next** and recommend one thing to start with. Give a recommendation, not a menu: if items block each other, order them; if something is cheap now and expensive later, lead with it. Note when an item's stated blocker has cleared.

**Read Bugs too, but lead with Up Next.** Close with one line on the bug list ("three open bugs, worst is X") rather than merging the two into one ranked list. If a bug has become urgent enough to lead with, say so and offer to promote it rather than recommending it from where it sits.

**When the ask is specifically for a bug** ("find me an easy one to fix", "what should I fix next"), rank Bugs instead and skip the Up Next summary. Cheapness is judged from the index line's constraint, not from the code: an entry whose premise is unverified or marked "not reproduced" is not low-hanging, however small the fix sounds.

## Showing the list

Read the `TODO.md` index in full. No detail docs: this mode is a scan, not a study. Then give two short groups:

1. **Three you'd recommend**, each with a one-line reason. Weigh what unblocks other work, what is cheap now and expensive later, and what the user would enjoy building. Say why you picked.
2. **Three most recently added** — the top three in Backlog / Ideas, where new items land.

Then one line for **Bugs**: how many, and the worst. Keep it scannable; summarize long sections rather than dumping them.

## Marking done

Identify which task from what they said, matching on description across all sections of the index. **Do the whole thing here; do not defer to the structure check, which has already run by this point:**

1. **Remove the index entry** from `TODO.md`, and **`rm docs/todo/<slug>.md`** if it has one. Nothing is archived; `git log` is the record.
2. **Repoint cross-references to it**, then run `./.claude/skills/proj-todo/check.sh` to confirm no dead link or orphan is left behind.

If nothing matches, say so rather than guessing — it may never have been written down, in which case offer to add it as already-done. If **more than one** plausibly matches, ask rather than picking.

## Implementing a task

Find the best-matching `- [ ]` item in the index. If no match, say so and stop.

1. **Open its detail doc if it has one, before writing any code.** Same reason as "Checking before you build": the rejected alternatives are in there, and re-proposing one is the failure this costs a single file read to avoid.
2. Implement it — read whatever files are needed, make the changes, explain what you did.
3. Immediately after writing the changes, mark it done per "Marking done": remove the index line, `rm` the doc, then repoint cross-references and run the invariant greps.

Do **not** ask whether the changes look good before marking done. Applying them is sufficient.

**Size the approach first, though.** Some entries describe a directory move plus a redirect plus five call-site edits. For anything touching more than a couple of files, say what you intend to do and confirm before starting, then implement and mark done without a second check. The no-confirmation rule is about not seeking reassurance on finished work, not about skipping a plan on work with real blast radius.
