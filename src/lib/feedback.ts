// Where visitor feedback goes. GitHub Issues is the whole v1 mechanism: no
// form, no inbox, no moderation surface to build, and a reporter can search
// for their bug before filing it.
//
// The repo path is a constant of its own so the day it changes there is one
// line to fix, however many links end up pointing at it.
const GITHUB_REPO_URL = "https://github.com/robertgrassian/personal_website";

// Deep-linked to the template chooser (`/issues/new/choose`) rather than the
// blank form, so the bug and idea templates in .github/ISSUE_TEMPLATE are
// what the reporter lands on.
export const NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new/choose`;
