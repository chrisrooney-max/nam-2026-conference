# Let attendees pick several tracks in the schedule filter
## What this changes
On `/schedule` the track pills toggle independently: pick two or more and the
schedule shows talks from any of them. "All" clears the selection. The selection
is `?track=a,b` in the URL and survives a reload; one track or none behaves as today.
Each pill exposes `aria-pressed`. `/speakers?track=` is unchanged.
## Where
- `server/routes/sessions.js` — the `trackSlug` line in `GET /`: split on `,`, trim, drop empties, `t.slug IN (?, ?)`; test in `tests/api/endpoints.test.js` (or a new `tests/api/sessions-tracks.test.js`) using `startApi`/`client` from `tests/api/harness.js` and `/bootstrap` track slugs.
- `src/pages/SchedulePage.jsx` — `filters.track` stays the raw comma string (so `qs()`, `BLOCKERS` and `activeKeys` keep working, and two or more tracks force list view exactly as one does); add a `toggleTrack(slug)` that splits `filters.track`, adds or removes the slug, and calls `set('track', joined)` (empty joins to `ALL`, which deletes the key); pill `active` becomes `selected.includes(t.slug)`, with `aria-pressed={active}`; the All pill is active when none selected and also gets `aria-pressed`. `api.getSessions` already forwards `trackSlug` as a string, so `src/lib/api.js` is untouched.
- `tests/schedule.spec.js` — new test using `visit`, `waitForResults`, `API`, and `?view=list&day=<conferenceDays()[0]>`; clicks pills, no seat state, so no lane needed.
- `context/engineering-context/schedule.md` — update the `GET /api/sessions` filters, `SchedulePage` and filter-rail text so track is multi-value.
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Two or more tracks show only talks from those tracks | `/sessions?trackSlug=a,b` returns only sessions of tracks a or b, and its count equals the sum of the two single-track counts | API |
| Adding then removing a track updates `result-count` to match the API | spec clicks pill A, then B, then un-clicks A, asserting `result-count` equals `/sessions?...trackSlug=` length each time | browser spec |
| Selection is in the URL and survives a reload | spec asserts `track=a,b` in URL, reloads, both pills `aria-pressed=true` and count unchanged | browser spec |
| A single track and "all" behave as today | existing single-slug API assertions in `endpoints.test.js`; spec: a single pill gives `track=a`, All removes `track` | API + browser spec |
| Two or more tracks fall the grid back to list | spec on `?view=grid&track=a,b`: `schedule-grid` absent, `grid-blocked-notice` visible | browser spec |
| API tests and a browser spec cover adding and removing | the rows above | API + browser spec |
| The doc matches the code | `schedule.md` updated in the same change; `node scripts/context.mjs for server/routes/sessions.js src/pages/SchedulePage.jsx` names it | review |
## Decisions
Clicking a pill adds it to the selection rather than replacing it; clicking a selected pill removes it.
## Out of scope
The speakers page track filter and every other schedule filter stay single-value.
