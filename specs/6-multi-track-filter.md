# Let attendees pick several tracks in the schedule filter
## What this changes
On `/schedule` the track pills become a multi-select: clicking a track adds it, clicking it again removes it, and the list shows talks from any selected track. "All" clears the selection. The selection lives in the URL as `?track=a,b` and survives a reload. Each track button (and "All") exposes `aria-pressed`. Two or more tracks force the list view, as one track does today.

## Where
- `server/routes/sessions.js` — line 38: split `trackSlug` on commas, drop empties, and push `t.slug IN (?, ?)` with one arg each; one value yields the same query shape as today (`IN (?)`); test in `tests/api/endpoints.test.js` (own `sessions` describe case, using the harness's `boot.tracks`).
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (so `qs()`, `BLOCKERS` and `activeKeys` keep working); add a `selectedTracks` array from it; track buttons (~line 165-180) call a `toggleTrack(slug)` that adds/removes from the array and calls `set('track', joined)` (empty joins to deletion); `active` is `selectedTracks.includes(t.slug)`; "All" is active when none selected; all three get `aria-pressed`. Test in `tests/schedule.spec.js` using `visit`, `waitForResults`, `API` from `tests/helpers.js`; the spec is read-only so it needs no data lane or clock pin beyond what the neighbouring track test does.
- `docs/context/schedule.md` — the `trackSlug` row (line 32) becomes `t.slug IN (…)`; the filters/URL paragraph (~55) and the track pills line (~72) say multi-select; the Gotchas convention bullet stays.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Two or more tracks show only talks from those tracks | `/sessions?trackSlug=a,b` returns only a or b sessions and exactly the union of the single-track results | API (`endpoints.test.js`) |
| Adding and removing a track update `result-count` to match the API | click track A, then B, then remove A; each time `result-count` equals the API count for the current set | Browser (`schedule.spec.js`) |
| Selection in URL, survives reload | after selecting two, URL has `track=a,b`; after `page.reload()` both pills are `aria-pressed=true` and count is unchanged | Browser |
| Single track and "All" as today | `trackSlug=a` result is unchanged; "All" removes `track` from the URL and its pill is pressed; existing `endpoints.test.js` cases hold | API + Browser |
| Two or more tracks fall back to list | with `view=grid` absent on a wide viewport, selecting two tracks shows `grid-blocked-notice` / list | Browser |
| API and browser specs cover add and remove | the two specs above | API + Browser |
| `schedule.md` matches code | `tests/unit/context.test.js` checks plus review of the three edits | Unit / review |

## Decisions
- Clicking "All" while tracks are selected clears them, and clicking the last selected track also returns to "All" — OK?
- An unknown slug in a comma list simply matches nothing (no 400), as a single unknown slug does today — OK?
- The blocker phrase stays "a track filter" for any number of tracks — OK?

## Out of scope
The speakers page track filter (`/speakers?track=`) and making any other filter multi-value.
