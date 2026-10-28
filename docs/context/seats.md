---
area: seats
summary: Adding a session to your agenda — taking a seat or a waitlist place, giving it back, and the swap offered when two seats clash.
read_when: touching reservations, seat counts, the waitlist, promotion, the overlap or ended guard, ConflictDialog, SeatPanel, or any /api/users route
files:
  - server/lib/seats.js
  - server/routes/users.js
  - src/components/SeatPanel.jsx
  - src/components/ConflictDialog.jsx
tests:
  - tests/api/seats.test.js
  - tests/api/overlap.test.js
  - tests/api/interests.test.js
  - tests/seats.spec.js
related: [attendance, agenda, clock, architecture, testing]
---

# Seats

The rules themselves are in CLAUDE.md § There is exactly one action and § The
attendee chain. This is where they live.

## How it works

**Server — `server/lib/seats.js`.** Tables: `reservations (user_id, session_id,
status 'confirmed'|'waitlisted', created_at)` and the counter
`sessions.seats_taken`. All statements are prepared at module scope.

- `seatState(sessionId, userId)` — the payload every seat route returns:
  `{ sessionId, capacity, seatsTaken, seatsLeft, isFull, waitlistCount, status,
  waitlistPosition }`. `status` is `null` when the user holds nothing;
  `waitlistPosition` is 1-based, counted by `created_at` ahead of yours. Returns
  `null` for an unknown session. Also used by `routes/sessions.js` for the
  `seats` field of `GET /sessions/:id?userId=`.
- `reserveSeat(userId, sessionId, now)` — `db.transaction`. In order:
  1. unknown session → `null` (route sends 404);
  2. already holding any reservation → current `seatState`, no write (idempotent);
  3. `now.day` and `now.time` both present and the session is over (earlier day,
     or same day with `ends_at <= now.time`) → `{ ...seatState, rejected: 'ended' }`;
  4. the `overlapping` statement finds a **confirmed** reservation of this user
     on the same day whose interval intersects → `{ ...seatState, rejected:
     'overlap', wanted, conflictsWith }`, each `{ id, title, startsAt, endsAt,
     roomName, venueName }`;
  5. otherwise insert as `confirmed` (and `bumpSeats +1`) or, if
     `seats_taken >= capacity`, as `waitlisted` with no bump.
- `releaseSeat(userId, sessionId)` — `db.transaction`. Deletes the row; if it
  was `confirmed`, `bumpSeats -1`, then walks `waitingInOrder` (`created_at,
  user_id`) and promotes the first waiter who has no clashing confirmed seat
  (same `overlapping` statement), re-bumping +1. Returns `{ ...seatState,
  promoted: userId|null }`. Releasing nothing returns plain `seatState`.

**Routes — `server/routes/users.js`** (mounted at `/api/users`):

| Route | Calls | Notes |
| --- | --- | --- |
| `PUT /:id/reservations/:sessionId` body `{day,time}` | `reserveSeat` | 404 unknown user/session; **409** with the state body when `rejected` is set |
| `DELETE /:id/reservations/:sessionId` | `releaseSeat` | no user-exists check |
| `GET /:id/reservations/:sessionId` | `seatState` | |
| `PUT /:id/interests` body `{interests: [topic tag name, …]}` | module-scope `topicNames`/`setInterests` | replaces the whole set and answers `toUser`; **400** unless an array of topic tag names (an unknown or tech/audience/vibe tag, a non-string), `[]` clears; duplicates collapse, order kept; 404 unknown user |

The same file also owns routes from other areas — change them here, but the
logic lives elsewhere: `GET /` and `GET /:id` (the user plus `followedSpeakers`,
`speaker`, `speakingSessions`, `reservations`, `checkIns`, `ratings`);
`GET /:id/agenda.ics` (`lib/ical.js:agendaCalendar`); `GET /:id/today` and
`GET /:id/schedule` (`lib/agenda.js:todayFor`/`scheduleFor`, see the agenda
doc); attendance, check-in and rating routes (see the attendance doc); and
`PUT`/`DELETE /:id/follows/:speakerId` and `PUT /:id/interests` (row above), which write `speaker_follows` directly
through the module-scope `follow`/`unfollow` statements.

**Client.** `src/lib/api.js:reserveSeat(userId, sessionId, now)` PUTs `now` as
the body; `api()` throws on non-2xx but keeps `err.status` and `err.payload`.
`src/lib/store.jsx` (architecture owns it) holds the seat state:

- `reservations: Map<sessionId, status>` loaded from `GET /users/:id` on user
  switch; `seatCounts: Map<sessionId, counts>` filled by `applySeatState`.
- `reserveSeat` sends `clock`, catches a 409 and uses `err.payload`. `'ended'`
  → toast only; `'overlap'` → `setConflict(state)` and nothing applied;
  otherwise `applySeatState` + toast ("Seat booked" or the waitlist position).
  Any other failure toasts "Could not book that seat: …" (`alert`) and resolves
  `undefined`, applying nothing.
- `releaseSeat(id, session)` → `applySeatState` + toast; the message differs
  when `promoted`. A failure toasts "Could not remove that seat: …", applies
  nothing and resolves `undefined`. The `action: { label: 'Undo', onClick: () => reserveSeat(id) }`
  is attached **only** when a `session` is passed and `hasEnded(session, clock)`
  is false — Undo is a fresh reservation and the API refuses one for a finished
  session, so no session means no Undo.
- `toggleSeat(id, session)` picks release or reserve from `reservations.has(id)`;
  every caller passes the session object it already rendered;
  `reservationFor(id)` → status or `null`; `onAgenda(id)` → boolean;
  `seatsFor(id)` → the live counts or `null`.
- `resolveConflict(swap)` — on swap, releases `conflict.conflictsWith.id`, then
  reserves `conflict.wanted.id` (may land on the waitlist, toasted as such);
  always clears `conflict`.

`src/components/Layout.jsx` renders `<ConflictDialog conflict onSwap onCancel
busy>` once for the whole app, wired to `resolveConflict(true|false)`. The
dialog shows `conflictsWith` ("Keep") and `wanted` ("Swap"). It does not trap
focus, but moves it in on open, restores it on close, locks body scroll and closes on
Escape unless `busy`.

`SeatPanel({ session })` is rendered on `SessionPage`. It reads counts from
`seatsFor()` first, then `session.seats`, then `session.capacity/seatsTaken`;
its own status comes **only** from `reservationFor()`. Card-level buttons
(`SessionCard`, `ScheduleGrid`, `SessionPage`) call `toggleSeat`.

Once `hasEnded(session, clock)` (`src/lib/clock.js`) is true and no seat is
held, no control offers one: `SeatPanel` renders a disabled
`session-ended-seat` instead of `reserve-seat`, `SessionPage` disables
`save-session` ("Session ended") and shows `session-ended`, `SeatButton`
takes `ended` (disabled, named "Session ended", never calls `onClick`) and
the grid buttons are disabled likewise. A seat already held keeps its status
and can still be released.

Testids: `seat-panel`, `seat-count`, `seats-left`, `reservation-confirmed`,
`reservation-waitlisted`, `reserve-seat`, `session-ended-seat`, `session-ended`,
`release-seat`, `conflict-dialog`,
`conflict-keep`, `conflict-swap`.

## Invariants

- `seats_taken` moves only inside `reserveSeat`/`releaseSeat`, and only for
  confirmed rows; `bumpSeats` clamps at 0.
- A waitlist place never counts for the overlap guard — you may queue for two
  clashing sessions, and promotion is what skips you.
- The `ended` guard runs only when the client sends both `day` and `time`; a
  bare PUT books anything. `new Date()` is used only for `created_at`.
- Waitlist order is `created_at` (ISO string) then `user_id`; the position in
  `seatState` counts strictly earlier `created_at`, so two rows in the same
  millisecond share a position.

## Gotchas

- An overlap 409 applies nothing to the store; after a swap the store is
  updated from both responses, so do not refetch the page to "fix" it.
- Undo on a released seat is a fresh `reserveSeat` — it goes to the back of any
  queue and can itself hit the overlap guard, which is why it is not offered at
  all once the session has ended (the 409 `ended` toast in `reserveSeat` now
  only covers a session that ends between page load and click).
- `SeatPanel` must not read `session.seats.status`: that payload is stale after
  a release (see CLAUDE.md § There is exactly one action).
- The API tests use `startApi()` and need no cleanup; `tests/seats.spec.js`
  shares the live database, so each test takes a lane via `laneFor` and
  releases what it books. The browser conflict-dialog test is in
  `tests/attendance.spec.js`.

## Where to change…

- A new rejection reason: add it in `seats.js:reserveSeat`, then a branch in
  `store.jsx:reserveSeat` — otherwise it falls through to `applySeatState`.
- A new field on the seat payload: `seats.js:seatState`, then
  `store.jsx:applySeatState` if the UI needs it live.
- Seat panel copy or states: `SeatPanel.jsx`. Dialog layout: `ConflictDialog.jsx`.
