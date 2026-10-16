# Give the user switcher dropdown an opaque surface
## What this changes
Opening "Viewing as" in the header shows the attendee list on a solid panel: page content behind it no longer shows through, so names, job titles and "N on agenda" stay legible. The header, toasts and conflict dialog keep `.glass` exactly as it is.
## Where
- `src/components/UserSwitcher.jsx` — the `role="listbox"` div (about line 46): replace the `glass` class with `bg-overlay` (the token `--color-overlay`, `#2e3345`, fully opaque). `border-hairline` and the shadow stay. The `hover:bg-raised` row hover is darker than `overlay`, so it still reads as a hover; the active row's `bg-violet-500/12` tints over the solid surface.
- `src/index.css` — untouched; `.glass` is not edited. Tokens are in `@theme`, so there is no light-theme variant to add today.
- test in `tests/smoke.spec.js` (new test "user switcher dropdown is opaque") using `visit(page, '/')` with the default attendee; it books nothing, so it needs no data lane. Open it with `getByRole('button', { name: /Viewing as/ })`, then read `getComputedStyle` of `getByRole('listbox')`.
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| No background content is visible through the open dropdown | listbox computed `background-color` has alpha 1 (`rgb(...)`, not `rgba(...)`) and `backdrop-filter` is `none`; false today (`rgba(24,27,37,0.86)`, blur 20px) | Playwright spec, desktop and mobile |
| Names, titles and "N on agenda" legible over busy pages | follows from the opaque surface above; open the dropdown on `/schedule` in the same test so busy content is behind it | Playwright spec |
| Header, toasts, conflict dialog unchanged | `.glass` is not edited; the existing seats spec that opens `ConflictDialog` and the smoke suite still pass | existing specs |
| Reads correctly in both themes | not applicable: no light theme exists on main; the surface uses a theme token so it follows one if it lands | none |
## Decisions
- Use `overlay` (not `raised`) for the surface, since the rows already hover to `raised` and need a visible step — OK?
## Out of scope
Changing `.glass`, and the restyle of the closed button (separate ticket, same file: land one after the other).
