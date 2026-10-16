import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { attendedSession, clearAgenda, overlaps, startApi } from './harness.js';

/**
 * The agenda payload — `GET /api/users/:id/schedule`.
 *
 * Hours mean hours you hold a chair for, so a day's totals are split: a
 * confirmed seat counts towards `totalMinutes`, a waitlist place towards
 * `waitlistedMinutes`. My Agenda renders both from this shape, so proving the
 * split here is what stops the page and the API telling different stories.
 */

let api;
let close;

before(async () => { ({ api, close } = await startApi()); });
after(() => close());

describe('A day on the schedule', () => {
  test('counts confirmed minutes and waitlisted minutes apart', async () => {
    const user = 5;
    await clearAgenda(api, user);

    const sessions = await api.json('/sessions');
    const seat = sessions.find((s) => !s.isFull && s.seatsLeft > 2 && !s.isKeynote);
    assert.ok(seat, 'the seed should leave a session with seats to spare');
    // Not overlapping the seat: this case is about the two totals. A sold-out
    // talk that does overlap is queued behind the seat as a backup — see below.
    const queue = sessions.find((s) => s.isFull && s.day === seat.day && !overlaps(s, seat));
    assert.ok(queue, 'the seed should sell out a session on that same day');

    const taken = await api.put(`/users/${user}/reservations/${seat.id}`, {});
    assert.equal(taken.body.status, 'confirmed');
    const queued = await api.put(`/users/${user}/reservations/${queue.id}`, {});
    assert.equal(queued.body.status, 'waitlisted');

    const { days } = await api.json(`/users/${user}/schedule`);
    const day = days.find((d) => d.date === seat.day);

    assert.equal(day.totalMinutes, seat.durationMins);
    assert.equal(day.waitlistedMinutes, queue.durationMins);

    // both still listed, each with the status it is held under
    const held = new Map(day.sessions.map((s) => [s.id, s.reservation]));
    assert.equal(held.get(seat.id), 'confirmed');
    assert.equal(held.get(queue.id), 'waitlisted');
  });
});

describe('A waitlist place over a held backup seat', () => {
  test('adds to waitlistedMinutes, not totalMinutes', async () => {
    const user = 6;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const queue = sessions.find((s) => s.isFull && sessions.some((o) => !o.isFull && o.seatsLeft > 2 && overlaps(o, s)));
    const seat = sessions.find((s) => !s.isFull && s.seatsLeft > 2 && overlaps(s, queue));
    assert.ok(queue && seat, 'the seed should sell out a session opposite one with room');

    assert.equal((await api.put(`/users/${user}/reservations/${seat.id}`, {})).body.status, 'confirmed');
    const queued = await api.put(`/users/${user}/reservations/${queue.id}`, {});
    assert.equal(queued.body.status, 'waitlisted', 'the clashing full talk queues behind the backup');

    const { days } = await api.json(`/users/${user}/schedule`);
    const day = days.find((d) => d.date === seat.day);
    assert.equal(day.totalMinutes, seat.durationMins, 'only the seat you hold counts as booked');
    assert.equal(day.waitlistedMinutes, queue.durationMins);
  });
});

describe('Attendance on the schedule', () => {
  /*
   * My Agenda marks every session that is over as rated, checked in or
   * missed, on every day — so the agenda payload has to say, per session,
   * whether this attendee checked in and what they gave it.
   */
  test('carries checkedIn and myStars for each session held', async () => {
    const { userId, session, stars } = await attendedSession(api);
    const { days } = await api.json(`/users/${userId}/schedule`);
    const all = days.flatMap((d) => d.sessions);

    const attended = all.find((s) => s.id === session.id);
    assert.ok(attended, 'the attended session should be on their agenda');
    assert.equal(attended.checkedIn, true);
    assert.equal(attended.myStars, stars);

    // The seed only checks people in on Day 1 morning, so a later day is untouched.
    const future = all.find((s) => s.day > session.day);
    assert.ok(future, 'the seed should give them a session on a later day');
    assert.equal(future.checkedIn, false);
    assert.equal(future.myStars, null);
  });
});
