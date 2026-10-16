import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, days, overlaps, shiftTime, startApi } from './harness.js';

/**
 * The overlap guard, and the one other thing a seat request can be refused for.
 *
 * A clash is a choice, not an error: the 409 carries both sessions so the UI
 * can open a Keep / Swap dialog. That means the body matters as much as the
 * status code, which is what these tests pin down.
 */

let api;
let close;
let DAYS;

before(async () => {
  ({ api, close } = await startApi());
  DAYS = await days(api);
});
after(() => close());

/** Two sessions that collide in time, both with seats going spare. */
async function collidingPair() {
  const sessions = (await api.json('/sessions')).filter((s) => !s.isFull && s.seatsLeft > 2);
  for (const held of sessions) {
    const wanted = sessions.find((s) => s.id !== held.id && overlaps(s, held));
    if (wanted) return { held, wanted };
  }
  return null;
}

describe('Two seats in one slot', () => {
  test('are refused with both sessions in the body, not just a complaint', async () => {
    const user = 3;
    await clearAgenda(api, user);
    const { held, wanted } = await collidingPair();

    assert.equal((await api.put(`/users/${user}/reservations/${held.id}`)).body.status, 'confirmed');
    const res = await api.put(`/users/${user}/reservations/${wanted.id}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'overlap');
    assert.equal(res.body.wanted.id, wanted.id);
    assert.equal(res.body.conflictsWith.id, held.id);
    // enough of each side to render them next to each other
    for (const side of [res.body.wanted, res.body.conflictsWith]) {
      for (const field of ['title', 'startsAt', 'endsAt', 'roomName', 'venueName']) {
        assert.ok(side[field], `${field} missing from the conflict payload`);
      }
    }
  });

  test('leave the refused session exactly as it was', async () => {
    const user = 4;
    await clearAgenda(api, user);
    const { held, wanted } = await collidingPair();
    const before = (await api.json(`/sessions/${wanted.id}`)).seats;

    await api.put(`/users/${user}/reservations/${held.id}`);
    const res = await api.put(`/users/${user}/reservations/${wanted.id}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.status, null, 'a refused request must not leave a reservation behind');
    assert.equal(res.body.seatsTaken, before.seatsTaken);
    assert.equal((await api.get(`/users/${user}/reservations/${wanted.id}`)).body.status, null);
  });

  test('are allowed once the clashing seat is given up — that is the swap', async () => {
    const user = 6;
    await clearAgenda(api, user);
    const { held, wanted } = await collidingPair();

    await api.put(`/users/${user}/reservations/${held.id}`);
    assert.equal((await api.put(`/users/${user}/reservations/${wanted.id}`)).status, 409);

    await api.del(`/users/${user}/reservations/${held.id}`);
    const swapped = await api.put(`/users/${user}/reservations/${wanted.id}`);
    assert.equal(swapped.status, 200);
    assert.equal(swapped.body.status, 'confirmed');
  });

  test('do not count a waitlist place as a seat you are holding', async () => {
    const user = 2;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const full = sessions.find((s) => s.isFull);
    const alongside = sessions.find((s) => !s.isFull && s.seatsLeft > 2 && overlaps(s, full));
    assert.ok(alongside, 'the seed should offer something opposite a sold-out session');

    assert.equal((await api.put(`/users/${user}/reservations/${full.id}`)).body.status, 'waitlisted');
    const seat = await api.put(`/users/${user}/reservations/${alongside.id}`);
    assert.equal(seat.status, 200, 'queuing for one thing must not block booking another');
    assert.equal(seat.body.status, 'confirmed');
  });
});

describe('A clash is a choice only while the wanted talk has room', () => {
  test('a talk with room that clashes with a held seat is still a 409, never a queue place', async () => {
    const user = 3;
    await clearAgenda(api, user);
    const { held, wanted } = await collidingPair();
    assert.equal(wanted.isFull, false, 'the wanted talk has room');

    await api.put(`/users/${user}/reservations/${held.id}`);
    const res = await api.put(`/users/${user}/reservations/${wanted.id}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'overlap');
    assert.equal(res.body.conflictsWith.id, held.id);
    assert.equal(res.body.backup, undefined, 'there is nothing to keep as a backup when you can simply swap');
  });

  test('a full talk that is already over answers ended, not a place in its queue', async () => {
    const user = 4;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const full = sessions.find((s) => s.isFull && sessions.some((o) => !o.isFull && o.seatsLeft > 2 && overlaps(o, s)));
    const held = sessions.find((s) => !s.isFull && s.seatsLeft > 2 && overlaps(s, full));
    assert.equal((await api.put(`/users/${user}/reservations/${held.id}`)).body.status, 'confirmed');

    const res = await api.put(`/users/${user}/reservations/${full.id}`, { day: full.day, time: full.endsAt });
    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'ended', 'the ended guard runs before any clash is weighed');
    assert.equal(res.body.status, null);
  });
});

/**
 * A session in the exact same slot as `held`, but on a different day, with
 * seats to spare — every seeded day repeats the same slot grid, so this
 * always exists.
 */
function sameSlotOtherDay(sessions, held) {
  return sessions.find((s) =>
    s.day !== held.day && s.startsAt === held.startsAt && s.endsAt === held.endsAt &&
    !s.isFull && s.seatsLeft > 2);
}

describe('The overlap guard is per day', () => {
  test('the same slot on another day is not a clash, but the same day still is', async () => {
    const user = 1;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const { held, wanted } = await collidingPair();
    const otherDay = sameSlotOtherDay(sessions, held);
    assert.ok(otherDay, 'every seeded day repeats the same slot grid');

    assert.equal((await api.put(`/users/${user}/reservations/${held.id}`)).body.status, 'confirmed');

    // Same slot, different day: must succeed, not read as a clash with `held`.
    const otherDayRes = await api.put(`/users/${user}/reservations/${otherDay.id}`);
    assert.equal(otherDayRes.status, 200);
    assert.equal(otherDayRes.body.status, 'confirmed');

    // Same day, overlapping interval: must still be refused.
    const sameDayRes = await api.put(`/users/${user}/reservations/${wanted.id}`);
    assert.equal(sameDayRes.status, 409);
    assert.equal(sameDayRes.body.rejected, 'overlap');
    assert.equal(sameDayRes.body.conflictsWith.id, held.id);
  });
});

describe('A session that is already over', () => {
  test('cannot be booked, and says so rather than silently succeeding', async () => {
    const user = 5;
    await clearAgenda(api, user);
    const session = (await api.json('/sessions')).find((s) => s.day === DAYS[0] && !s.isFull);

    const res = await api.put(`/users/${user}/reservations/${session.id}`, {
      day: DAYS[3], time: '21:00',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'ended');
    assert.equal(res.body.status, null);
  });

  test('is over the moment it ends, and not a minute before', async () => {
    const user = 5;
    await clearAgenda(api, user);
    const session = (await api.json('/sessions')).find((s) => s.day === DAYS[0] && !s.isFull);
    const url = `/users/${user}/reservations/${session.id}`;

    const running = await api.put(url, { day: session.day, time: shiftTime(session.endsAt, -1) });
    assert.equal(running.status, 200, 'still running, so still bookable');
    await api.del(url);

    const over = await api.put(url, { day: session.day, time: session.endsAt });
    assert.equal(over.status, 409);
    assert.equal(over.body.rejected, 'ended');
  });

  test('is judged by the clock the client sends, because conference time is simulated', async () => {
    const user = 5;
    await clearAgenda(api, user);
    const session = (await api.json('/sessions')).find((s) => s.day === DAYS[3] && !s.isFull);

    // the same request, from two different moments
    const early = await api.put(`/users/${user}/reservations/${session.id}`, { day: DAYS[0], time: '09:00' });
    assert.equal(early.status, 200);
    await api.del(`/users/${user}/reservations/${session.id}`);

    const late = await api.put(`/users/${user}/reservations/${session.id}`, { day: DAYS[3], time: '23:30' });
    assert.equal(late.status, 409);
    assert.equal(late.body.rejected, 'ended');
  });
});
