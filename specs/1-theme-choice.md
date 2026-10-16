# Let attendees choose light, dark or system theme
## What this changes
The header gains a Light / Dark / System control (visible on desktop and mobile). A first-time visitor still sees dark. System follows the OS scheme and switches live when it changes; the choice is kept in `localStorage` (`orbit:theme`) and survives a reload. A light token set sits beside the dark one, so every page, the generated art, the venue board and map, glass surfaces, the conflict dialog and toasts read correctly in both.
## Where
- `src/lib/theme.js` (new) — pure `resolveTheme(choice, osPrefersDark)` → `'light' | 'dark'` (unknown/missing choice → `'dark'`), `readChoice()`, and a `useTheme()` hook returning `{ choice, resolved, setChoice }`: stores the choice, sets `data-theme` on `<html>`, and listens to `matchMedia('(prefers-color-scheme: dark)')` while the choice is `system`. Unit test in `tests/unit/theme.test.js`.
- `index.html` — a tiny inline script in `<head>` applying `data-theme` before first paint, so a stored light choice does not flash dark.
- `src/index.css` — `html[data-theme="light"]` overrides of `--color-ground/surface/raised/overlay/hairline/ink/muted/faint`, `color-scheme: light` for that theme, and light values for `glass`, scrollbar thumb, `body::before` wash. Dark stays the default `@theme`.
- `src/components/Layout.jsx` — a `ThemeToggle` in the header's right-hand `div` beside `UserSwitcher` (a `role="group"` named "Theme" with three buttons, `aria-pressed`, `data-testid="theme-<choice>"`); `Icon` names reused or added in `src/components/Icon.jsx`.
- `src/components/VenueRouteMap.jsx` (lines ~50–61) — the `rgba(255,255,255,…)` road/grid strokes become `currentColor`/token-based so they show on light; `GeneratedCover.jsx`/`GeneratedAvatar.jsx` dark glyph fills checked on light backgrounds.
- `src/**` — the 32 `text-white` / `bg-white/…` / `bg-black/…` class uses are reviewed; any that sit on a token surface move to `text-ink` / token equivalents (`ConflictDialog.jsx`, `Toaster.jsx`, `VenueBoard.jsx` first).
- `tests/helpers.js` — `visit()` gains `theme = 'dark'` and writes `orbit:theme` in its init script, so no spec depends on the machine's OS setting.
- `tests/theme.spec.js` (new) — uses `visit()` and `page.emulateMedia({ colorScheme })`; no data lane needed (no seats booked).
- `docs/context/ui.md` — replace "Dark only (`color-scheme: dark`)" with the two token sets, `data-theme`, `orbit:theme` and `useTheme`.
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Control with Light/Dark/System in the header has an accessible name | `getByRole('group', { name: 'Theme' })` contains three buttons, on desktop and mobile projects | spec `theme.spec.js` |
| First-time visitor sees dark, even with OS set to light | `emulateMedia light`, no stored choice → `html[data-theme=dark]` | spec |
| System follows the OS and changes live without reload | choose System, `emulateMedia` dark → light → `data-theme` flips, no navigation | spec |
| Choice survives a reload | choose Light, `reload()`, still `light` and `aria-pressed` on Light | spec |
| `resolveTheme` rules (default dark, system follows OS, junk → dark) | `resolveTheme(undefined,false)==='dark'`, `('system',false)==='light'`, `('light',true)==='light'` | unit `theme.test.js` |
| Every page legible in both themes incl. glass, dialog, toasts | in light, `body` computed background is the light ground and header (`glass`) background differs from dark; visiting each top-level route yields no console errors; ConflictDialog/toast text computed colour is not near-white on a light surface | spec (smoke over routes, via `failOnPageErrors`) |
| Tests pin the theme | `visit()` default writes `orbit:theme=dark`; a spec with OS light and no override still sees dark | spec |
| `ui.md` no longer says "Dark only" | `grep -c "Dark only" docs/context/ui.md` is 0 | unit-level doc check in `theme.test.js` reading the file |
## Decisions
- Three buttons in a segmented group in the header, rather than a menu — OK?
- Store the choice under `orbit:theme` as `light | dark | system`, matching the existing `orbit:` keys — OK?
- Generated avatars/covers keep their own bright gradients in both themes (only their dark glyph fills are checked) — OK?
## Out of scope
Per-page themes and any scheme beyond light and dark.
