# A site email address for feedback, so people without a GitHub account can report bugs and ideas

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The library header links to GitHub Issues (`NEW_ISSUE_URL` in `src/lib/feedback.ts`), which is a
dead end for anyone without a GitHub account, and that is most visitors who are not developers.

_What already exists._ `/privacy` publishes `rgrassian@gmail.com` twice, in the data-deletion
paragraph and in the Contact section, both as hardcoded `mailto:` anchors in `privacy/page.tsx`. So
the site is not silent on how to reach the owner. What is missing is an address that is not a
personal inbox, and any mention of it where feedback is actually invited.

_The decision this item carries_ is whether the address is a real mailbox or an alias forwarding to
the personal one. An alias is minutes of DNS work and can be retired if it attracts spam; a real
mailbox is a second inbox to remember to check. Either way the address wants to move into
`src/lib/feedback.ts` next to the issue URL, and the two `privacy/page.tsx` anchors should read it
from there rather than repeating the literal, so a later change is one edit.

Publishing an address on a public page invites scrapers. Worth accepting rather than defending
against: obfuscation tricks break `mailto:` for real people and the address is already public.

_Rejected 2026-08-23: an in-app feedback form that posts to GitHub Issues through a bot token._
The form itself is easy; the problem is that a Server Action is a public HTTP endpoint, so an
ungated form is an unauthenticated "create content in my public repo" endpoint that spam bots find.
The mitigation that actually works is requiring sign-in, which was explicitly not wanted: a
logged-out visitor is the likeliest bug reporter. Revisit only if email proves too high-friction to
get any reports at all.
