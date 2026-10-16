# Make the user switcher look demo-only
## What this changes
The closed attendee button in the header no longer looks like an account menu. It gains a small "Viewing as" label, a "Demo" tag and a dashed amber border, on desktop and mobile. Opening it, its dropdown and its accessible name (`Viewing as <name>. Switch attendee.`) are unchanged.
## Where
- `src/components/UserSwitcher.jsx` — the closed `<button>`: swap `border-hairline` for `border-dashed border-amber-400/60` (hover keeps the amber), add a `Viewing as` caption and a `Demo` tag span before the avatar/name. Keep both visible on mobile (only the first name stays `hidden sm:block`). Keep `aria-label` as is, so the existing `getByRole('button', { name: /Switch attendee/ })` lookups in `tests/plan.spec.js` still match. There are no test ids on it today, so none are lost.
- `tests/smoke.spec.js` — new test; plain `page`, no lane (read-only, no seat state), runs in both desktop and mobile projects. Finds the button by `getByRole('button', { name: /Switch attendee/ })`, asserts it contains visible "Viewing as" and "Demo" text and that its computed `border-top-style` is `dashed`.
- `docs/context/ui.md` — the `UserSwitcher` bullet (~line 128): mention the demo cues.
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Closed switcher visibly differs from the nav, desktop and mobile | smoke test asserts computed `border-top-style` is `dashed` (header nav buttons are solid today) | Playwright spec, both projects |
| Carries "Viewing as" and "Demo" cues | same test: button text contains visible "Viewing as" and "Demo" (neither is visible text today, the label is aria-only) | Playwright spec |
| Existing tests that open the switcher still pass | `tests/plan.spec.js` switcher tests, unchanged | Playwright spec |
| Legible in both themes if light theme landed | not applicable: `src/index.css` has a dark theme only; amber on the dark surface is used | none |
## Decisions
The light/dark clause is conditional and no light theme exists, so it is treated as not applicable.
## Out of scope
The dropdown's opacity (tracked separately).
