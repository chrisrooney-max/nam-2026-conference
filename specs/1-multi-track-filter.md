# Let attendees pick several tracks in the schedule filter
## What this changes
On `/schedule` the Track pills become toggles: each pill adds or removes its track, and the list shows talks from any selected track. "All" clears the selection. The selection lives in the URL as `?track=a,b` and survives a reload. Two or more tracks fall the grid back to the list, as one does today. The speakers page and every other filter stay single-value.
## Where
- `server/routes/sessions.js` — the `trackSlug` clause (line 38): split on commas, drop empties, push `t.slug IN (?, ?)` with one bound `?` per slug; a single value is the same query as today. Update the filters comment. Test in `tests/api/track-filter.test.js` (new, `tests/api/harness.js` throwaway database).
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (so `useFetch` deps, `activeKeys` and `BLOCKERS` work unchanged); add `selectedTracks = filters.track === ALL ? [] : filters.track.split(',')` and a `toggleTrack(slug)` that adds/removes and calls `set('track', list.join(','))` (empty clears the key). Pill `active` becomes `selectedTracks.includes(t.slug)`, each track pill gets `aria-pressed`, and the All pill gets `aria-pressed` when nothing is selected. Test in `tests/schedule.spec.js` using `visit`, `waitForResults`, and `request` against `${API}/sessions` (read-only, so no data lane is needed).
- `context/engineering-context/schedule.md` — the `trackSlug` row of the filter table (line 32), the page-key mapping paragraph (~line 55), and the track pill sentence (~line 72).
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Selecting two or more tracks shows only talks from those tracks | `GET /sessions?trackSlug=a,b` returns exactly the union of a's and b's sessions, each with track a or b (false today: no row matches `a,b`) | API |
| Adding a track and removing one each update `result-count` to match the API's counts | spec clicks pill A, then B, then un-clicks A, asserting `result-count` equals the API count for the same `trackSlug` after each step | Browser spec |
| The selection is in the URL and survives a reload | spec asserts `track=a,b` in the URL, reloads, and both pills are `aria-pressed="true"` with the same count | Browser spec |
| A single track and "all" behave as they do today | API: single `trackSlug` result equals the union of rows with that track; existing `endpoints.test.js` still passes; spec: All clears `track` from the URL and `aria-pressed` | API + spec |
| Two or more tracks still fall the grid back to the list | spec on `/schedule?view=grid&track=a,b`: the Grid tab is disabled and `grid-blocked-notice` shows | Browser spec |
| API tests and a browser spec cover adding and removing | the two new test files above | API + spec |
| `schedule.md` matches the code | `npm test` context checks (`scripts/context.mjs for`) plus review | Review |
## Decisions
- Does an unknown slug inside a list (`a,nope`) simply match nothing for that entry, rather than erroring — OK?
- Does the speakers page keep its own single `track` handling, untouched — OK?
