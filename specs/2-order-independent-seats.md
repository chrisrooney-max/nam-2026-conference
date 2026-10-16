# Make seat and waitlist rules independent of click order

## What this changes
Today the order you click decides what you end up with. Hold a seat in talk A,
then try to queue for a clashing full talk B: 409, Keep/Swap dialog. Queue for B
first, then book A: both succeed, and when B later frees up, promotion *skips* you.

After this, both orders end the same way: **A confirmed, B waitlisted**. The
waitlisted talk is the one you prefer; the confirmed clash is your backup.

- Reserving a **full** session while holding a clashing confirmed seat queues you
  instead of returning 409, provided every clashing seat is *releasable* (below). The response carries `backup` (the seat you keep) and
  the toast says so: you keep "A" until a place opens in "B", then A is released.
- Promotion into B no longer skips you for holding a clash. It confirms you in B,
  **releases your clashing confirmed seat(s)**, and hands each released seat to
  that session's next eligible waiter (the same rule, so it cascades).
- **A backup you have begun is never released.** A confirmed seat is *locked*, not
  releasable, when you have a `check_ins` row for it, or when the request carries
  a clock and the session has started (`starts_at <= now.time` that day, or an
  earlier day). A check-in cannot be undone and a deleted row would drop the talk
  from My Agenda with its rating prompt, so a seat you are attending, or attended
  and have yet to rate, stays. At promotion, a waiter with **any** locked clash is
  skipped: they stay waitlisted with their place, the next waiter is tried, and no
  clash is released partially. We skip rather than promote-without-releasing
  because that would give you two confirmed seats in one slot. At queue time, a
  locked clash keeps today's behaviour (409 `overlap`, Keep/Swap), since there is no
  backup to promise. A seat that is finished and unattended has nothing to lose and
  counts as releasable.
- Unchanged: the `ended` guard (runs first); a clash with a talk that still has
  **room** is still a 409 with both sessions and the Keep/Swap dialog; hours and
  day totals count confirmed seats only, waitlisted time stays in
  `waitlistedMinutes`.

## Where
- `server/lib/seats.js:reserveSeat` — compute `full` before the clash check; reject
  with `overlap` when `clash && (!full || anyLocked)`. When `clash && full` and
  every clash is releasable, insert as
  `waitlisted` and return `{ ...seatState, backup: { id, title, startsAt, endsAt,
  roomName, venueName } }` (same shape as `conflictsWith`).
- `server/lib/seats.js:overlapping` — drop `LIMIT 1`; callers use `.all(...)`
  (guard reads `[0]`), because a long talk can clash with two short confirmed seats.
  It also selects `day`/`starts_at` (already there) and gains a `checked_in` column
  (`EXISTS` on `check_ins`), from which a new pure helper `isLocked(row, now)` —
  `checked_in || (now?.day && now?.time && started)` — decides releasability.
- `server/routes/users.js` `DELETE /:id/reservations/:sessionId` — read optional
  `day` and `time` from the query string (as the attendance GET does; a DELETE has
  no body to rely on) and pass `now` to `releaseSeat`. `src/lib/api.js:releaseSeat`
  takes an optional `now` and appends it; `store.jsx` passes `clock` from both
  `releaseSeat` and `resolveConflict`.
- `server/lib/seats.js:releaseSeat(userId, sessionId, now)` — move the
  free-seat/promote body into a plain inner `freeSeat(userId, sessionId, now)`
  called inside the existing transaction. The promotion loop (`waitingInOrder`)
  replaces its `overlapping` filter: it takes the first waiter whose clashes
  (`overlapping.all`) are all releasable, promotes, then `freeSeat`s each clash,
  which recurses for the cascade (`now` threads through, so a cascaded waiter's own
  backups are protected the same way). Return shape
  (`promoted`) is unchanged. No `seed.js` change.
- `src/lib/store.jsx:reserveSeat` — when `state.backup`, toast "Room is full — you
  are #N on the waitlist. You keep “<backup.title>” until a place opens, then it
  is released."; otherwise the existing messages. `resolveConflict` is untouched.
- `docs/context/seats.md` — `reserveSeat` steps 4–5, `releaseSeat` (and the DELETE row's optional `day`/`time`) including the locked-backup rule, Client bullet
  for the toast, Invariants (waitlist place still never counts for the *guard*;
  promotion now releases clashing confirmed seats), and the Gotcha that the
  promoted attendee has no live channel. `CLAUDE.md` § attendee chain rule 1: one
  clause that a full clashing talk queues you and keeps the seat as backup.
- Tests, API layer (`npm test`), `startApi()` throwaway DB, no lane needed:
  - `tests/api/seats.test.js` — replace "promotion skips a waiter who has since
    taken a clashing seat" (now false by design) with the cases below, plus the
    locked-backup cases (checked in, no clock; started, clock sent; queue-time 409
    when the clash is locked); reuse
    `promotionFixture`, `emptyTheQueue`, `clearAgenda`, `overlaps`. The cascade
    needs a clashing session A with <=4 seats left (the seed leaves eight like
    that): clear the attendees involved, fill A to capacity with them, queue one
    on A, then run the scenario.
  - `tests/api/agenda.test.js` — new case on `/users/:id/schedule`; also fix the
    stale comment ("the clash guard runs before the room is found full").
  - `tests/api/overlap.test.js` — add the room-has-space and ended-wins pins.
- Test, browser: `tests/seats.spec.js` (desktop + mobile) with a **new lane**
  `'seats.backup'` in `tests/helpers.js:LANES` (an attendee/day pair no other lane
  uses — `tests/unit/lanes.test.js` fails collisions; never Jonas, it queues).
  Book an open session over the API, `visit(page, /sessions/<full clash>, { as,
  at: momentOn(0, '07:00') })`, click `reserve-seat`, assert `toaster` text and
  `reservation-waitlisted`; release both in `finally`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Book-then-queue and queue-then-book end the same | `seats.test.js` "both click orders end with the seat confirmed and the preferred talk waitlisted": same attendee, A open and B full-clashing; run each order (release between), assert the 200 on the queue step and equal statuses, `seatsTaken` on both and `waitlistPosition`. Main returns 409 on book-then-queue | API |
| Promotion releases the backup and cascades | `seats.test.js` "promotion into the preferred talk frees the backup seat and promotes its queue": holder frees B; waiter W is `confirmed` in B and has no row in A; V (waiting on A) is `confirmed` in A; `seatsTaken` on A and B unchanged at capacity; `promoted` is W. Main skips W | API |
| A toast explains the swap | `store.jsx` toast, asserted by `seats.spec.js` "queueing behind a held seat tells you the seat is kept as backup" (toast contains the backup title); the API half is `backup.id === A.id` in the first test above. Main shows a conflict dialog, no toast | browser + API |
| An attended backup is never released | `seats.test.js` "promotion skips a waiter whose backup is checked in and promotes the next": W queued on full B, holds confirmed A (clashing) and has checked in to A; holder frees B; W is still `waitlisted` in B with row intact in A, the next waiter X is `confirmed`; same with no check-in but a clock after A's start sent on the DELETE. Plus "queueing for a full talk over a checked-in clash still 409s `overlap`". Main also skips W (it skips on any clash), so these are not red on main: they pin that the new release-on-promotion path does not regress the protection, and the first fails if the lock check is dropped | API |
| Never more than one confirmed seat per slot | in the cascade test, after each step assert no two `confirmed` sessions in `/users/:id/schedule` overlap, for W and the holder; main never reaches the state (no promotion) so the assertion is only reachable on the branch | API |
| `ended` guard and 409 for two confirmed seats unchanged | existing `overlap.test.js` "are refused with both sessions…" and "A session that is already over" stay as they are, plus two new pins: a clash with a talk that has room still 409s with `rejected: 'overlap'`; a full, finished session with a held clash answers `ended`, not a queue place. These hold on main today: they are regression pins, the red proof is carried by the rows above | API |
| Hours and totals still confirmed-only | `agenda.test.js` "a waitlist place over a held backup seat adds to waitlistedMinutes, not totalMinutes": `totalMinutes === A.durationMins`, `waitlistedMinutes === B.durationMins`. Main refuses the queue step, so B is never waitlisted | API |
| API tests cover both orders and the cascade | the three seats.test.js cases above | API |
| `seats.md` describes the new behaviour | `grep -n "skipping\|no clashing confirmed seat" docs/context/seats.md` returns nothing; `grep -n "backup" docs/context/seats.md` hits (the old text is on main) | grep (docs only; `specs/` not searched) |

## Decisions
- Releasing a backup the attendee has begun (checked in, or started on the sent
  clock) is refused by skipping that waiter at promotion; they keep their waitlist
  place. Chosen over promote-without-release (breaks the one-seat-per-slot rule)
  and over release-anyway (loses an attended talk and its rating prompt).
- `releaseSeat` gets the clock the way `reserveSeat` does — from the client, as
  optional `day`/`time` query parameters — and, like the `ended` guard, the
  started test only runs when both are sent; the check-in test needs no clock, so
  it protects even a bare DELETE. The releaser's clock stands in for the waiter's:
  conference time is one simulated clock, not per-viewer state.
- The waitlisted talk is treated as the preferred one and the confirmed clash as
  the backup, in both orders, including a seat that was itself won off a queue.
- A full clashing talk queues you with a toast; the Keep/Swap dialog now appears
  only when the wanted talk has room.
- The promoted attendee is not on screen when it happens (no push channel), so
  the toast explains the swap at queue time rather than at promotion time; the
  releaser's toast is unchanged.

## Out of scope
- Re-evaluating a skipped waiter when time later passes (they are reconsidered on
  the next freed seat only).
- Telling the promoted attendee live, or on their next visit (needs stored
  notifications). A cascade that promotes the *releasing* attendee elsewhere
  leaves their store stale until reload.
- Changing seed rules or the My Agenda clash banner (it still lists backup vs
  preferred as a clash, which is accurate).
