# Let attendees pick several tracks in the schedule filter
## What this changes
On `/schedule` the track pills become toggles: each can be switched on and off, and the list shows talks from any selected track. The pills carry `aria-pressed`; `All` clears the selection. The selection lives in the URL as `?track=a,b`, so it survives a reload, and `/api/sessions` accepts `trackSlug=a,b`. A single track and `All` behave as today, and two or more tracks still drop the grid to the list view (the existing `track` blocker).

## Where
- `server/routes/sessions.js` — the `if (trackSlug)` line (~38): split on `,`, trim, drop empties, push `t.slug IN (?, ?)` with one `?` per slug; update the doc comment. One value yields the same query shape. Test in `tests/api/track-filter.test.js` (new) using `startApi`/`api.json` from `tests/api/harness.js` (throwaway DB, no lane).
- `tests/api/endpoints.test.js` — add `/sessions?trackSlug=a,b` to `filtered()` so the breadth walk covers it.
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (so `useFetch` deps and `qs()` need no change); add `selectedTracks = filters.track === ALL ? [] : filters.track.split(',')`; the track pills (~line 165-180) call `set('track', next.join(','))` (empty list → `ALL`), with `aria-pressed={selectedTracks.includes(t.slug)}`; `All` gets `aria-pressed={selectedTracks.length === 0}`. `BLOCKERS`, `activeKeys` and `clearAll` already key on the non-`ALL` string, so the grid fallback holds.
- `tests/schedule.spec.js` — new test in `Schedule`: `visit(page, '/schedule?view=list')`, uses `waitForResults`, `API` and `conferenceDays()`; read-only, so no data lane or seat clean-up is needed. Clicks via the rail pills (on mobile, `Filters` first).
- `docs/context/schedule.md` — update the `trackSlug` row, the `SchedulePage` paragraph and the track pills sentence to say the key is comma-separated and the pills toggle.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Two or more tracks show only talks from those tracks | `/sessions?trackSlug=a,b` returns exactly the union of the `a` and `b` results (ids), non-empty; false today (matches `t.slug = 'a,b'`, so empty) | API (`track-filter.test.js`) |
| Adding and removing a track update `result-count` to the API's counts | spec clicks track A, then B, then removes A, asserting `result-count` equals the API's count for `A`, `A,B`, `B` each time | Browser (`schedule.spec.js`) |
| Selection is in the URL and survives a reload | after A and B, URL matches `track=a%2Cb` or `track=a,b`; after `page.reload()` both pills are `aria-pressed=true` and the count unchanged | Browser |
| A single track and "all" behave as today | API: `trackSlug=a` equals today's single-track result; spec: one pill gives `track=a`, `All` removes `track` and restores the unfiltered count | API + Browser |
| Two or more tracks fall back to list view | spec with `view=grid` and two tracks: `grid-blocked-notice` visible and no `schedule-grid` | Browser |
| API tests and a browser spec cover adding and removing | the two rows above, in the named files | API + Browser |
| `schedule.md` matches the code | review reads the doc against the diff (`context.mjs for` the touched files) | Review |

## Decisions
- Is a track added to the end of `?track=` in click order, rather than a fixed track order — OK?
- Should an unknown slug inside the list simply match nothing (as an unknown single slug does today), rather than raising a 400 — OK?
- Should empty segments such as `a,,b` or a trailing comma be ignored, rather than rejected — OK?

## Out of scope
The speakers page's track filter, and making any other filter multi-value.
