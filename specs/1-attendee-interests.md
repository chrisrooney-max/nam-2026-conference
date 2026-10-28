# Let attendees set their interests from the header
## What this changes
The attendee menu in the header gains an **Interests** button, shown for the signed-in attendee only (not per row; the rows stay the `option`s they are). It opens a modal listing the 35 topic tags as toggles, with the attendee's current interests already on. **Save** stores them and the modal closes; reopening, even after a reload, shows the new selection. **Cancel**, Escape and the backdrop close without saving. A new endpoint, `PUT /api/users/:id/interests`, does the write; an unknown or non-topic tag is a 400, and `{ "interests": [] }` clears them.

## Where
- `server/routes/users.js` — add `usersRouter.put('/:id/interests', …)` beside the follows routes, with module-scope statements `topicNames` (`SELECT name FROM tags WHERE kind = 'topic'`) and `setInterests` (`UPDATE users SET interests = ? WHERE id = ?`, names joined by `,` as the seed stores them). Order: 404 `Attendee not found` (`userExists`) → 400 unless `req.body.interests` is an array of strings, each a topic tag name → dedupe, write, answer `toUser(getUser.get(id))`. `toUser` (`server/lib/query.js:194`) already splits the column into `interests`; no mapper change.
- `src/lib/api.js` — `setInterests(userId, interests)`: `PUT /users/${userId}/interests`, body `{ interests }`, next to `followSpeaker`.
- `src/lib/store.jsx` — `saveInterests(interests)` in the provider: calls `api.setInterests(currentUserId, …)`, then `setData` replaces that user in `data.users` with `{ ...u, ...updated }` (keeps `reservedCount`); exposed on the context value. This is what makes reopening show the new set without a reload, as `currentUser` reads `data.users`.
- `src/components/InterestsDialog.jsx` (new) — copies `ConflictDialog.jsx` and `docs/context/ui.md` § Dialogs: `createPortal` to `document.body`, `role="dialog"`, `aria-labelledby` heading "Your interests", `data-testid="interests-dialog"`, `max-h-[85dvh]` with the topic list scrolling and Save/Cancel outside it, Escape/focus effect, backdrop `Close` button. Topics are `tags.filter((t) => t.kind === 'topic')` from `useConference()`; each a `button` with `aria-pressed`, `data-testid="interest-<slug>"`, initial state from `currentUser.interests`. Save calls `saveInterests`, closes on success, toasts `Could not save: …` and stays open on failure.
- `src/components/UserSwitcher.jsx` — a `data-testid="open-interests"` button "Interests" in the menu, between the list and the speaker/talk links; clicking it does `setOpen(false)` and `setEditing(true)`. Render `<InterestsDialog>` at the top level of the component, **not** under `open &&`: the portalled dialog sits outside `ref`, so the outside-pointerdown handler would otherwise close the menu and unmount it mid-click.
- `tests/api/endpoints.test.js` — add `'PUT users/:id/interests'` to `covered` in "the whole surface is covered", or `npm test` fails on the new route.
- `tests/api/interests.test.js` (new) — `startApi()` from `tests/api/harness.js`, own throwaway database, `api.put` / `api.json`; no lane or cleanup needed.
- `tests/switcher.spec.js` — new test using `visit`, `ATTENDEES` and a new lane `'switcher.interests'` in `tests/helpers.js` `LANES` via `laneFor(…, testInfo)`. Interests book nothing, so mark both panes `agenda: false` and pick a free attendee per project (e.g. desktop kenji, mobile marcus, day 3 — only to satisfy the table); confirm with `tests/unit/lanes.test.js`. The test reads the attendee's interests first and restores them with a `PUT` in `finally`. Dialog closes follow `docs/context/testing.md` § Testing a dialog.
- `docs/context/seats.md` — Routes table: row for `PUT /:id/interests` (it owns every `/api/users` route). `docs/context/architecture.md` — `useConference()` list gains `saveInterests`, and the note on what `data.users` holds. `docs/context/ui.md` — the `UserSwitcher` paragraph gains the Interests action and `InterestsDialog`. `docs/context/seed.md` — one line that the endpoint holds writes to the same topic-only rule as the seed.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Switcher shows Interests for the current attendee; switching still works | New switcher spec opens the menu, expects `open-interests` visible, opens and cancels the dialog, then picks Andy and expects "Viewing as Andy Vays" (false on main: no such button). The existing switcher tests stay as the regression guard. | browser |
| Modal lists topic tags and pre-selects current interests | Same spec: dialog shows one toggle per topic tag (count from `/api/bootstrap`, no tech/audience/vibe tag), and the toggles `aria-pressed="true"` equal the attendee's `interests` from `GET /api/users/:id` | browser |
| Saving then reopening shows the new selection, including after a reload | Same spec: toggle one off and one on, Save, reopen and expect the new set; `page.reload()`, reopen, expect it again; `finally` restores the original via `PUT` | browser |
| API rejects unknown or non-topic tag with a 400 | `interests.test.js`: `PUT` `["Not A Tag"]` → 400, and a tech tag (`"Python"`) → 400, and a non-array body → 400; each leaves `GET /users/:id` interests unchanged | API |
| Empty set clears the attendee's interests | `interests.test.js`: `PUT` `[]` → 200, response and `GET /users/:id` both have `interests: []` | API |
| API tests cover a valid save, an invalid tag and clearing | `interests.test.js` (three tests above plus: valid save returns and persists the set; unknown attendee → 404; duplicates collapsed) | API |
| Browser spec covers open, select, save, reopen; own attendee; restores | The switcher spec above, on its own lane attendee, restoring in `finally` | browser |
| `docs/context` describes the endpoint | `node scripts/context.mjs for server/routes/users.js` lists `seats.md`, which gains the route row; checked by the code-review lens, since no test reads prose | review |

## Decisions
- The ticket points at an endpoint list in `architecture.md`, but that file only lists the meta endpoints; every `/api/users` route lives in `seats.md`'s Routes table. Put the endpoint there, and the new store function in `architecture.md`'s `useConference()` list — OK?
- Interests are stored and accepted as topic tag **names** (the seed writes names and `toUser` returns them), not slugs — OK?
- `PUT /api/users/:id/interests` with `{ interests: [...] }` replaces the whole set and answers the updated user; duplicates are collapsed rather than rejected, request order is kept, and a missing or non-array `interests` is a 400 — OK?
- The Interests button appears once, for the signed-in attendee, and the menu closes when it opens the dialog — OK?

## Out of scope
Using interests for suggestions (`agenda.md`: they are never read there), showing them anywhere else, and editing another attendee's.
