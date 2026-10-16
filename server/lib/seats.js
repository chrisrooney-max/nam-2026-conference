import { db } from '../db.js';
import { toMinutes } from './query.js';

/**
 * Seat inventory.
 *
 * `sessions.seats_taken` is the live count — it moves when someone reserves or
 * releases. Everything here runs inside a transaction because a reservation
 * touches two tables and must not half-apply.
 *
 * When a session is full, reservations are accepted as `waitlisted` and do not
 * consume a seat. Releasing a confirmed seat promotes the longest-waiting
 * person automatically.
 *
 * A full talk that clashes with a seat you hold queues you rather than being
 * refused: the waitlisted talk is the one you prefer and the confirmed clash is
 * your backup. Promotion into the preferred talk releases the backup, so the
 * outcome does not depend on which you clicked first.
 */

const getSession = db.prepare(`
  SELECT s.id, s.capacity, s.seats_taken, s.day, s.starts_at, s.ends_at, s.title,
         rm.name AS room_name, v.short_name AS venue_name
  FROM sessions s
  JOIN rooms rm ON rm.id = s.room_id
  JOIN venues v ON v.id = rm.venue_id
  WHERE s.id = ?`);
const getReservation = db.prepare('SELECT status, created_at FROM reservations WHERE user_id = ? AND session_id = ?');
const insertReservation = db.prepare(
  'INSERT INTO reservations (user_id, session_id, status, created_at) VALUES (?, ?, ?, ?)');
const deleteReservation = db.prepare('DELETE FROM reservations WHERE user_id = ? AND session_id = ?');
const bumpSeats = db.prepare('UPDATE sessions SET seats_taken = MAX(0, seats_taken + ?) WHERE id = ?');
const waitingInOrder = db.prepare(`
  SELECT user_id FROM reservations
  WHERE session_id = ? AND status = 'waitlisted'
  ORDER BY created_at, user_id`);
const promote = db.prepare("UPDATE reservations SET status = 'confirmed' WHERE user_id = ? AND session_id = ?");
const countWaiting = db.prepare("SELECT COUNT(*) n FROM reservations WHERE session_id = ? AND status = 'waitlisted'");
const waitlistAhead = db.prepare(`
  SELECT COUNT(*) n FROM reservations
  WHERE session_id = ? AND status = 'waitlisted' AND created_at < ?`);

/** Current seat state for one session, from one attendee's point of view. */
export function seatState(sessionId, userId) {
  const s = getSession.get(sessionId);
  if (!s) return null;
  const mine = userId ? getReservation.get(userId, sessionId) : null;

  return {
    sessionId: s.id,
    capacity: s.capacity,
    seatsTaken: s.seats_taken,
    seatsLeft: Math.max(0, s.capacity - s.seats_taken),
    isFull: s.seats_taken >= s.capacity,
    waitlistCount: countWaiting.get(sessionId).n,
    status: mine?.status ?? null,
    waitlistPosition: mine?.status === 'waitlisted'
      ? waitlistAhead.get(sessionId, mine.created_at).n + 1
      : null,
  };
}

/**
 * You cannot hold two seats at the same time. This is the one invariant every
 * real reservation system enforces — AWS re:Invent and Google I/O both block
 * it outright rather than warning — because a seat you cannot physically use
 * is a seat somebody else wanted.
 */
const overlapping = db.prepare(`
  SELECT s.id, s.title, s.starts_at, s.ends_at, s.day, r.status,
         rm.name AS room_name, v.short_name AS venue_name,
         EXISTS (SELECT 1 FROM check_ins c WHERE c.user_id = r.user_id AND c.session_id = s.id) AS checked_in
  FROM reservations r
  JOIN sessions s ON s.id = r.session_id
  JOIN rooms rm ON rm.id = s.room_id
  JOIN venues v ON v.id = rm.venue_id
  WHERE r.user_id = ?
    AND r.status = 'confirmed'
    AND s.id != ?
    AND s.day = ?
    AND s.starts_at < ?
    AND ? < s.ends_at`);

/**
 * A backup seat that has been begun is never given up for a better one: you have
 * checked in to it, or — when the client sends a clock — it is running now. A
 * check-in cannot be undone and deleting the row would drop an attended talk
 * from My Agenda along with its rating prompt. A finished, unattended seat has
 * nothing left to lose, so it can go.
 */
function isLocked(row, now) {
  if (row.checked_in) return true;
  if (!(now?.day && now?.time)) return false;
  return row.day === now.day
    && toMinutes(row.starts_at) <= toMinutes(now.time) && toMinutes(now.time) < toMinutes(row.ends_at);
}

const brief = (r) => ({
  id: r.id, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
  roomName: r.room_name, venueName: r.venue_name,
});

export const reserveSeat = db.transaction((userId, sessionId, now) => {
  const s = getSession.get(sessionId);
  if (!s) return null;
  if (getReservation.get(userId, sessionId)) return seatState(sessionId, userId); // already holding one

  // You cannot take a seat in something that has already finished. Without this
  // the app will happily sell you a chair in a talk that ended three days ago.
  if (now?.day && now?.time) {
    const over = s.day < now.day || (s.day === now.day && toMinutes(s.ends_at) <= toMinutes(now.time));
    if (over) return { ...seatState(sessionId, userId), rejected: 'ended' };
  }

  // A clash with a talk that has room is a choice (Keep / Swap). A clash with a
  // full talk queues you instead, provided every seat in the way can be let go
  // later; one you have begun cannot, so there is no backup to promise.
  const full = s.seats_taken >= s.capacity;
  const clashes = overlapping.all(userId, sessionId, s.day, s.ends_at, s.starts_at);
  const locked = clashes.find((c) => isLocked(c, now));
  if (clashes.length && (!full || locked)) {
    const clash = locked ?? clashes[0];
    return {
      ...seatState(sessionId, userId),
      rejected: 'overlap',
      // Both sides, so the client can present an actual choice rather than an error.
      wanted: {
        id: s.id, title: s.title, startsAt: s.starts_at, endsAt: s.ends_at,
        roomName: s.room_name, venueName: s.venue_name,
      },
      conflictsWith: brief(clash),
    };
  }

  insertReservation.run(userId, sessionId, full ? 'waitlisted' : 'confirmed', new Date().toISOString());
  if (!full) bumpSeats.run(1, sessionId);

  return clashes.length
    ? { ...seatState(sessionId, userId), backup: brief(clashes[0]) }
    : seatState(sessionId, userId);
});

/**
 * Drop one reservation and, if it was a confirmed seat, hand it to the next
 * eligible waiter. A waiter holding clashing seats is eligible only when none
 * of them is locked; promoting them releases those seats, which hands each on by
 * the same rule — hence the recursion. Returns who was promoted into this seat.
 */
function freeSeat(userId, sessionId, now) {
  const mine = getReservation.get(userId, sessionId);
  if (!mine) return null;
  deleteReservation.run(userId, sessionId);
  if (mine.status !== 'confirmed') return null;

  bumpSeats.run(-1, sessionId);
  const s = getSession.get(sessionId);
  for (const waiter of waitingInOrder.all(sessionId)) {
    const clashes = overlapping.all(waiter.user_id, sessionId, s.day, s.ends_at, s.starts_at);
    // skipped, not promoted-without-releasing: that would be two seats in one slot
    if (clashes.some((c) => isLocked(c, now))) continue;
    promote.run(waiter.user_id, sessionId);
    bumpSeats.run(1, sessionId);
    for (const c of clashes) freeSeat(waiter.user_id, c.id, now);
    return waiter.user_id;
  }
  return null;
}

export const releaseSeat = db.transaction((userId, sessionId, now) => {
  if (!getReservation.get(userId, sessionId)) return seatState(sessionId, userId);
  const promoted = freeSeat(userId, sessionId, now);
  return { ...seatState(sessionId, userId), promoted };
});
