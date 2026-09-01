# Take a pass at every button, then replace the shared class strings with reusable components

_Section: **Up Next** &middot; index: [`TODO.md`](../../TODO.md)_

## What prompted it

On the game detail card, "Remove from library" is a small tinted red button, and the "Remove" that
confirms it is an outlined red button with no fill. The confirm sheet that landed 2026-08-30 puts
both on screen in the same interaction, which is what made the mismatch visible. Save is filled
while "View or add play history" is outlined, so the fill rule is not obvious from the outside
either.

Stated preference: probably no background, but undecided.

_A second case, reported 2026-09-01 while testing the add form:_ "Add to library" reads as unstyled
next to the rest of the dialog: it is `buttonClass`, outlined with no fill, sitting beside "Back to
search", and it is the primary action of the whole dialog. This is the filled-vs-outlined rule
above working exactly as written (nothing is pending behind an add, so it is not a Save), which is
the clearest evidence yet that the rule is the thing to re-decide rather than this one button.
Whatever wins has to answer what the primary action of a dialog looks like when it is not
committing a draft, since `accentButtonClass` is currently reserved for page-level CTAs.

## The premise to correct before deciding anything

This is not drift, and there is no missing abstraction to add. `formStyles.ts` already centralizes
seven recipes (`buttonClass`, `saveButtonClass`, `dangerButtonClass`, `dangerSubtleButtonClass`,
`ghostButtonClass`, `accentButtonClass`, `headerMenuItemClass`), and **the exact pairing that
prompted this is a deliberate rule with its reasons written down in that file**:

- `dangerSubtleButtonClass` is tinted _because_ it shares a row with Save: the tint is what keeps
  that row with one obvious default action.
- `dangerButtonClass` is outlined _because_ it sits next to Cancel, and a filled red button next to
  a neutral one reads as the default, which a destructive confirm must never be.
- Filled vs outlined encodes a third rule: filled means "commit a pending draft" (Save), outlined
  means an action with nothing pending behind it ("Move to library", "Add to library").

So "make them all match" cannot be done without overturning at least one of those. Going
background-free everywhere removes the device that keeps Save the default in the Remove row;
tinting both halves of the two-step makes the destructive confirm compete with Cancel. The work is
re-deciding these rules, then encoding whatever wins.

## The product decision

Where does button hierarchy come from: fill, color, or position? Today it is all three, applied per
situation. A defensible alternative is one filled accent per surface and everything else outlined,
with red used only as text and border. Whichever wins, write the rule down where the components
live, because the current rules were written down and still produced a result that read as
inconsistent.

## Why three components is probably not enough

`save`, `remove` and `other` do not cover what already exists:

- **Page-level CTA** (`accentButtonClass`): sign in, "Add game", the onboarding submit. Roomier
  than Save and deliberately carries no text size, because onboarding's is a step larger.
- **Text-only** (`ghostButtonClass`): "Clear rating", "Enter manually".
- **Menu rows** (`headerMenuItemClass`): the library header menu, shared by `<a>`, next/link and
  `<button>` so a mixed list reads as one thing.
- **Icon-only**: the detail card's close and back buttons, `StatsPanel`'s close. Hand-rolled today,
  with their own 44px touch targets and negative margins.
- **Toggles**: the view tabs in `GameLibrary`, and `SqlQueryPanel`'s three buttons, all hand-rolled.

Decide which of these become components, which stay class strings, and which are simply left alone.

## Constraints an implementer will hit

_The module is already site-wide, but does not live there._ `formStyles.ts` sits in
`src/components/video_games/`, yet `AuthButton`, `OnboardingForm` and the account page all import
it from outside. A site-wide button component should move out of the library directory; that is a
rename touching every importer.

_Two surfaces, one set of buttons._ The detail card re-points the shelf tokens on
`.game-card-surface` so the same recipes work on its dark scrim, and the account page renders them
on the light shelf. `--shelf-danger` is documented as sitting at the contrast floor (4.86:1 at
rest, 4.57:1 on hover, with "re-measure before darkening" in the comment). Any restyle of the red
has to be checked on both surfaces and in both color schemes.

_Composition is the reason class strings were chosen._ Call sites add their own positional
modifiers (`mt-3`, `block`, `ml-auto`, `w-full`). A component has to keep that possible, via a
`className` passthrough or explicit layout props, or the refactor trades one inconsistency for a
pile of wrapper divs.

## The counter-argument, so it is not re-litigated

Components buy enforcement: a variant is a name, not a string a call site can quietly tweak. Class
strings buy composition and keep the styling greppable. It is legitimate to conclude that the rules
needed rewriting and the class strings did not, and to ship only the restyle plus the documented
rule. Decide that explicitly rather than by default.
