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
  4. `overlapping.all(...)` returns every **confirmed** reservation of this user
     on the same day whose interval intersects (each with `checked_in`). If there
     is one and the wanted session has **room**, or any clash is *locked* (below)
     → `{ ...seatState, rejected: 'overlap', wanted, conflictsWith }`, each `{ id,
     title, startsAt, endsAt, roomName, venueName }`; `conflictsWith` is the
     locked clash if there is one;
  5. otherwise insert as `confirmed` (and `bumpSeats +1`) or, if
     `seats_taken >= capacity`, as `waitlisted` with no bump. A **full** session
     over releasable clashes is the waitlisted case and returns `{ ...seatState,
     backup }` — the clash you keep (same brief shape as `conflictsWith`). The
     waitlisted talk is the one you prefer; the confirmed clash is the backup.
- **Locked seats.** `isLocked(row, now)`: a clashing seat is locked when the
  attendee has a `check_ins` row for it, or when the clock (`now.day`+`now.time`,
  both) says it is running (`starts_at <= time < ends_at`). Locked seats are never
  released for a better one — a check-in cannot be undone and deleting the row
  would drop an attended talk and its rating prompt. A seat that has finished and
  was never attended is releasable. The check-in test needs no clock, so it
  protects even a bare DELETE.
- `releaseSeat(userId, sessionId, now)` — `db.transaction`; a no-op returning
  plain `seatState` when you hold nothing. Otherwise `freeSeat` (plain function,
  recursive) deletes the row; if it was `confirmed`, `bumpSeats -1`, then walks
  `waitingInOrder` (`created_at, user_id`) and promotes the first waiter **none of
  whose clashing confirmed seats is locked**, re-bumping +1. A waiter with a
  locked clash is skipped and keeps their place. The promoted waiter's clashing
  seats are then released with `freeSeat` — each hands its own seat to that
  session's next eligible waiter, so a promotion can cascade. `now` threads
  through. Returns `{ ...seatState, promoted: userId|null }` (the first waiter
  promoted, not the cascade's).

**Routes — `server/routes/users.js`** (mounted at `/api/users`):

| Route | Calls | Notes |
| --- | --- | --- |
| `PUT /:id/reservations/:sessionId` body `{day,time}` | `reserveSeat` | 404 unknown user/session; **409** with the state body when `rejected` is set |
| `DELETE /:id/reservations/:sessionId` optional query `day`,`time` | `releaseSeat` | no user-exists check; the clock is a query string because a DELETE has no body |
| `GET /:id/reservations/:sessionId` | `seatState` | |

The same file also owns routes from other areas — change them here, but the
logic lives elsewhere: `GET /` and `GET /:id` (the user plus `followedSpeakers`,
`speaker`, `speakingSessions`, `reservations`, `checkIns`, `ratings`);
`GET /:id/agenda.ics` (`lib/ical.js:agendaCalendar`); `GET /:id/today` and
`GET /:id/schedule` (`lib/agenda.js:todayFor`/`scheduleFor`, see the agenda
doc); attendance, check-in and rating routes (see the attendance doc); and
`PUT`/`DELETE /:id/follows/:speakerId`, which write `speaker_follows` directly
through the module-scope `follow`/`unfollow` statements.

**Client.** `src/lib/api.js:reserveSeat(userId, sessionId, now)` PUTs `now` as
the body; `releaseSeat(userId, sessionId, now)` appends it as `?day=&time=`; `api()` throws on non-2xx but keeps `err.status` and `err.payload`.
`src/lib/store.jsx` (architecture owns it) holds the seat state:

- `reservations: Map<sessionId, status>` loaded from `GET /users/:id` on user
  switch; `seatCounts: Map<sessionId, counts>` filled by `applySeatState`.
- `reserveSeat` sends `clock`, catches a 409 and uses `err.payload`. `'ended'`
  → toast only; `'overlap'` → `setConflict(state)` and nothing applied;
  otherwise `applySeatState` + toast ("Seat booked", the waitlist position, or —
  when the response has `backup` — the position plus "You keep “<title>” until a
  place opens, then it is released." A queue over a held seat is never a dialog).
- `releaseSeat(id, session)` (sends `clock`, as does `resolveConflict`'s release)
  → `applySeatState` + toast; the message differs
  when `promoted`. The `action: { label: 'Undo', onClick: () => reserveSeat(id) }`
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
(`SessionCard`, `ScheduleGrid`, `TodayPanel`, `SessionPage`) call `toggleSeat`.

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
`conflict-keep`, `conflict-swap`. The backup toast is asserted in
`tests/seats.spec.js` (lane `seats.backup`); the API cases, including the
cascade and the locked-backup skips, are in `tests/api/seats.test.js`.

## Invariants

- `seats_taken` moves only inside `reserveSeat`/`releaseSeat`, and only for
  confirmed rows; `bumpSeats` clamps at 0.
- A waitlist place never counts for the overlap guard — you may queue for two
  clashing sessions. Promotion into one of them releases the confirmed clash
  (the backup), unless it is locked, so no attendee holds two confirmed seats in
  a slot.
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
- The promoted attendee is not on screen when it happens (no push channel), so
  the swap is explained by the toast at queue time, not at promotion. A cascade
  that promotes the *releasing* attendee elsewhere leaves their store stale
  until reload.
- A skipped waiter is reconsidered only on the next freed seat, not when time
  later unlocks their backup.
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
