---
area: ui
summary: The shared look and chrome — design tokens, primitives in ui.jsx, icons, accents, toasts, generated art, motion utilities, the header/nav/footer and the not-found page.
read_when: adding a component or page, styling anything, touching the nav or footer, icons, toasts, generated avatars or covers, animation, formatting times/dates/plurals
files:
  - src/index.css
  - src/lib/accents.js
  - src/lib/format.js
  - src/lib/useDocumentTitle.js
  - src/lib/useInView.js
  - src/lib/useMediaQuery.js
  - src/components/ui.jsx
  - src/components/Layout.jsx
  - src/components/Icon.jsx
  - src/components/Toaster.jsx
  - src/components/Reveal.jsx
  - src/components/CountUp.jsx
  - src/components/GeneratedAvatar.jsx
  - src/components/GeneratedCover.jsx
  - src/components/HeroMedia.jsx
  - src/components/UserSwitcher.jsx
  - src/components/RouteChange.jsx
  - src/pages/NotFoundPage.jsx
tests:
  - tests/unit/format.test.js
  - tests/smoke.spec.js
related: [architecture, speakers, venues, schedule, testing]
---

# UI

## How it works

**Tokens — `src/index.css` `@theme`.** Colours: `ground`, `surface`, `raised`,
`overlay` (the elevation ladder, see CLAUDE.md), `hairline` (borders), `ink`,
`muted`, `faint` (text, strongest → weakest). Fonts: `font-sans` (Inter),
`font-display` (Space Grotesk; `.font-display` also sets weight 700 and tight
tracking), `font-mono`. `--radius-card`. Custom utilities: `card` (surface +
hairline border + card radius — the module panel), `glass` (blurred translucent,
used by the header, toasts, menus), `hide-scrollbar`. Dark only
(`color-scheme: dark`). In SVG use `var(--color-ground)` etc.

**Motion utilities** (all in `index.css`, all neutralised by the
`prefers-reduced-motion` block at the bottom, which also forces `.reveal`
visible): `animate-rise` (dialogs, menus, toasts), `stagger` (list entrance; children
delay by `--i` × 40ms — set `style={{ '--i': i }}`, capped by callers at ~12),
`animate-pulse-dot` (live indicators), `animate-ken-burns`, `animate-slide-in`,
`animate-fade-zoom` and `animate-fill` (the speaker spotlight and its autoplay progress;
duration set inline), `reveal` (scroll-triggered, + `data-visible="true"`),
`animate-marquee` (sponsor logos).
JS-driven motion (`SpeakerSpotlight`, `HeroMedia`, `CountUp`) checks
`matchMedia('(prefers-reduced-motion: reduce)')` itself.

**`src/lib/accents.js`.** `ACCENTS[name]` → `{ chip, dot, ring, grad, text,
glow }` class strings for `violet cyan emerald amber orange rose fuchsia sky
lime teal`. `accent(name)` (unknown → violet). `ACCENT_HEX` / `accentHex(name)`
→ `[light, dark]` hex for SVG. `accentFor(label)` hashes any string to a stable
accent name (used for cuisines). A new colour needs a row in both maps.

**`src/lib/format.js`.** `time('14:05')` → `2:05 PM`; `timeRange(a, b)`;
`dayLabel(iso)` → `Tuesday, Sep 22`; `shortDay(iso)` → `Tue`;
`relativeDate(iso, clock)` → `12m ago` / `3h ago` / `Sep 22`, measured against
the conference clock, not the browser; `plural(n, one, many?)` → `"3 sessions"`;
`agendaSummary(total, bookedOnDay, dayPhrase)` → `"session · 2 today"` /
`"sessions · 2 on Day 1"`, the schedule rail's pluralised agenda line (the
caller builds `dayPhrase`).
Dates are parsed at `T12:00:00Z` with `timeZone: 'UTC'` so they never shift.

**`src/components/ui.jsx` exports:**

| Export | Props |
| --- | --- |
| `cx(...parts)` | joins truthy class strings |
| `Avatar` | `name, initials, accent, size (xs sm md lg xl), imageUrl, className, ring=true, mono=false` — photo if `imageUrl`, else `GeneratedAvatar`, else (`mono` or no name) initials on `accent.grad` |
| `Chip` | `accent?, className, as='span', ...rest` |
| `TrackPill` | `track` (uses `track.color`, `track.name`) |
| `Button` | `variant (primary ghost subtle danger; default ghost), size (sm md lg), to` → `Link`, `href` → `a`, else `button`; `as` overrides |
| `SeatButton` | `status (null confirmed waitlisted), onClick, size (sm md), title, ended` — the one agenda action; stops propagation and sits at `z-10` above card link overlays; `ended` without a `status` disables it as "Session ended" |
| `Rating` | `value, count, showValue` — "Not yet rated" when `count` is 0 |
| `SectionHeader` | `eyebrow, title, description, action, className` — renders an `h2` |
| `Spinner`, `Skeleton` | `className` |
| `EmptyState` | `icon='search', title, description, action` |
| `ErrorState` | `error, onRetry` — an `EmptyState` titled "That did not load" |
| `NotFoundState` | `title, backTo, backLabel` — an `EmptyState` with a link back instead of a retry button, for a 404 that can never succeed on retry (`SessionPage`, `SpeakerPage`) |
| `Stat` | `value` (numbers animate via `CountUp`), `label, accent, testId, note?` — `note` is a quieter line under the label, for a caveat on the number (My Agenda's `+Nh waitlisted`) |

**`Icon.jsx`.** `Icon({ name, className='size-5', filled, ...rest })` — stroke
icons, `aria-hidden`; an unknown name renders **nothing** (no error). Names:
`calendar users star pin food sparkle search clock chevronRight chevronLeft
chevronDown close menu check play external building car alert info mic layers
filter ticket globe wifi bookmark grid arrowRight heart bell live route`.
`BrandIcon({ name })`: `x github linkedin` (filled). Add a name = add a 24×24
path to `paths`.

**`Toaster.jsx`.** `<Toaster>` wraps everything in `main.jsx` (outside
`ConferenceProvider`, so the store can toast). `useToast()` returns
`toast({ message, icon='check', action?: { label, onClick }, duration })`;
default 4s, 10s when there is an action; keeps the newest 3. Container is
`data-testid="toaster"`, `role="status"`.

**Generated art.** `GeneratedAvatar({ name })` — SVG face hashed from the name
(12 palettes); only used through `Avatar`. `GeneratedCover({ seed, accent,
variant, className })` — FNV hash of `seed` (same seed, same art on every machine,
which keeps screenshots and tests stable), colours from `accentHex(accent)`;
variants `orbit` (default; keynote cards, session heroes), `mesh` (vendor tiles, the
spotlight backdrop), `strata` (wide banners), `mark` (sponsor logos). SVG ids derive from the hash, so two covers with the same seed on one
page share gradient ids (harmless — same art).

**Hooks and small components.** `useDocumentTitle(title)` → `"<title> · ORBIT '26"`,
falsy leaves the tab alone. `useInView({ threshold, rootMargin })` → `[ref,
visible]`, flips once. `useMediaQuery(q)` → boolean (`SchedulePage`'s grid/list
default). `Reveal({ as, delay })` = `useInView` + `reveal`. `CountUp({ value,
duration })` counts once visible. `HeroMedia` (home hero only) probes
`/images/hero-1..6.jpg`, cross-fades those that load, renders nothing if none.

**`Layout.jsx`** — the route shell (`<Route element={<Layout />}>` in
`App.jsx`). Renders `<RouteChange />`, the global `<ConflictDialog>` (wired to
`conflict` / `resolveConflict` from the store), a skip link to `#main`, the
sticky `glass` header, `<main id="main">`, and the footer.

- `NAV` array (`to, label, icon, end`) drives both the desktop nav (`lg+`,
  `aria-label="Main"`) and the mobile menu (`aria-label="Mobile"`, toggled by
  the "Open menu"/"Close menu" button, closes on navigation, locks body scroll).
  `/my-agenda` shows `reservations.size` as a badge.
- Footer: three `nav` columns (Programme, On site, Conference) built from an
  inline array of `[label, to]`, plus `conference.dates · conference.city` from
  bootstrap and a plain `<a href="/api/bootstrap">`.
- `UserSwitcher` sits in the header once `ready`. Closed, it is deliberately
  not styled like an account menu (there is no login): a dashed amber border,
  a visible "Viewing as" caption and a "Demo" tag, kept on mobile (only the
  first name hides below `sm`); `aria-label` is unchanged. Open, a `listbox` of
  `useConference().users`, calls `setCurrentUserId`; closes on outside pointer
  or Escape. Each row shows "N on agenda"; every row but the signed-in
  attendee's reads `u.reservedCount` from `/bootstrap` (frozen at load), but
  the active row counts `'confirmed'` entries in `useConference().reservations`
  instead, since that's the only attendee the store keeps reservation state
  for live — so booking or releasing a seat updates your own row without a
  reload, while everyone else's stays as `/bootstrap` had it.

**`RouteChange`** — on `pathname` change only (not search), scrolls to top and
focuses `#main`. **`NotFoundPage`** — the `*` route; its heading "Nothing
scheduled here".

## Invariants

- The smoke test `every link in the footer resolves` visits each footer href
  and fails if "Nothing scheduled here" appears — so a footer link needs a
  route in `App.jsx`, and renaming the not-found title breaks that test.
- The footer must contain `bootstrap.conference.dates` (smoke-tested); never
  hard-code a date there.
- Accent classes must be literal strings in `accents.js`; see CLAUDE.md.
- New motion needs an entry that the reduced-motion block neutralises, and must
  not leave content hidden when it is.

## Gotchas

- `Icon` with a misspelled name, and `useToast` outside `<Toaster>`, both fail
  silently (nothing renders / no-op).
- `SectionHeader` is each page's visible title; the smoke suite finds pages by it.
- `format.time` expects `HH:MM`, not an ISO timestamp.

## Where to change…

- A nav item: `NAV` in `Layout.jsx` (icon must exist in `Icon.jsx`).
- A footer link: the column array in `Layout`'s footer; add the route first.
- A new primitive used by more than one page: `ui.jsx`.
- A new token or utility: `@theme` / `@utility` in `index.css`.
- A new cover composition: another `variant` branch in `GeneratedCover`.
