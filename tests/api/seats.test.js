import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearAgenda, overlaps, shiftTime, startApi } from './harness.js';

/**
 * Seat inventory, at the API.
 *
 * There is exactly one action — adding a session takes a seat — so everything
 * in `server/lib/seats.js` is reachable through two verbs on one URL. The
 * database is this file's own copy, so tests book destructively and never
 * bother tidying up.
 */

const ATTENDEES = [1, 2, 3, 4, 5, 6];
/** Promotion tests consume their fixture, so each one takes a fresh session. */
const used = new Set();

let api;
let close;

before(async () => { ({ api, close } = await startApi()); });
after(() => close());

/** A session with room to spare. Call it after clearing the attendee's plan. */
async function openSession() {
  const sessions = await api.json('/sessions');
  return sessions.find((s) => !s.isFull && s.seatsLeft > 2);
}

/**
 * A sold-out session that somebody still holds a real seat on — releasing that
 * seat is the only way to make a promotion happen — together with a session it
 * clashes with that still has seats. The seed guarantees both exist.
 */
async function promotionFixture(skip) {
  const sessions = await api.json('/sessions');
  for (const session of sessions.filter((s) => s.isFull && !skip.has(s.id))) {
    for (const holder of ATTENDEES) {
      const { body } = await api.get(`/users/${holder}/reservations/${session.id}`);
      if (body.status !== 'confirmed') continue;
      const clashing = sessions.find((s) => s.id !== session.id && !s.isFull && overlaps(s, session));
      if (clashing) return { session, holder, clashing };
    }
  }
  return null;
}

/** Take everyone out of this session's queue, so promotion order is ours to set. */
async function emptyTheQueue(sessionId) {
  for (const id of ATTENDEES) {
    const { body } = await api.get(`/users/${id}/reservations/${sessionId}`);
    if (body.status === 'waitlisted') await api.del(`/users/${id}/reservations/${sessionId}`);
  }
}

describe('Taking a seat', () => {
  test('confirms the seat and moves the count for everybody', async () => {
    const user = 3;
    await clearAgenda(api, user);
    const session = await openSession();
    const before = (await api.json(`/sessions/${session.id}`)).seats;

    const res = await api.put(`/users/${user}/reservations/${session.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'confirmed');
    assert.equal(res.body.seatsTaken, before.seatsTaken + 1);
    assert.equal(res.body.seatsLeft, before.seatsLeft - 1);
    assert.equal(res.body.waitlistPosition, null);

    // the count is inventory, not a view of my own reservation
    const seen = (await api.json(`/sessions/${session.id}`)).seats;
    assert.equal(seen.seatsTaken, before.seatsTaken + 1);
  });

  test('twice over still only takes one seat', async () => {
    const user = 4;
    await clearAgenda(api, user);
    const session = await openSession();
    const url = `/users/${user}/reservations/${session.id}`;

    const first = await api.put(url);
    const second = await api.put(url);
    assert.equal(second.status, 200);
    assert.equal(second.body.status, 'confirmed');
    assert.equal(second.body.seatsTaken, first.body.seatsTaken);
  });

  test('and giving it back returns it to the room', async () => {
    const user = 2;
    await clearAgenda(api, user);
    const session = await openSession();
    const url = `/users/${user}/reservations/${session.id}`;
    const before = (await api.json(`/sessions/${session.id}`)).seats.seatsTaken;

    await api.put(url);
    const released = await api.del(url);
    assert.equal(released.status, 200);
    assert.equal(released.body.status, null);
    assert.equal(released.body.seatsTaken, before);
    assert.equal((await api.get(url)).body.status, null);
  });

  test('releasing something you never held changes nothing', async () => {
    const user = 6;
    await clearAgenda(api, user);
    const session = await openSession();
    const before = (await api.json(`/sessions/${session.id}`)).seats.seatsTaken;

    const res = await api.del(`/users/${user}/reservations/${session.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.seatsTaken, before);
    assert.ok(!res.body.promoted, 'no seat was freed, so nobody moves up');
  });
});

describe('Waitlists', () => {
  test('a full room offers a place in the queue and consumes no seat', async () => {
    const user = 5;
    await clearAgenda(api, user);
    const sessions = await api.json('/sessions');
    const full = sessions.find((s) => s.isFull);
    assert.ok(full, 'the seed should sell some sessions out');
    const before = (await api.json(`/sessions/${full.id}`)).seats;

    const res = await api.put(`/users/${user}/reservations/${full.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'waitlisted');
    assert.equal(res.body.waitlistPosition, before.waitlistCount + 1);
    assert.equal(res.body.waitlistCount, before.waitlistCount + 1);
    // joining a queue must not take a chair away from anyone
    assert.equal(res.body.seatsTaken, before.seatsTaken);
    assert.equal(res.body.isFull, true);
  });

  test('releasing a seat promotes whoever has waited longest', async () => {
    const [waiter, later] = [3, 5];
    await clearAgenda(api, waiter);
    await clearAgenda(api, later);

    const fixture = await promotionFixture(used);
    assert.ok(fixture, 'the seed should leave a sold-out session with a real holder');
    used.add(fixture.session.id);
    await emptyTheQueue(fixture.session.id);

    // `waiter` queues first, so the freed seat is theirs
    assert.equal((await api.put(`/users/${waiter}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    const second = await api.put(`/users/${later}/reservations/${fixture.session.id}`);
    assert.equal(second.body.status, 'waitlisted');
    assert.equal(second.body.waitlistCount, 2);

    const released = await api.del(`/users/${fixture.holder}/reservations/${fixture.session.id}`);
    assert.equal(released.body.promoted, waiter);
    assert.equal((await api.get(`/users/${waiter}/reservations/${fixture.session.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${later}/reservations/${fixture.session.id}`)).body.status, 'waitlisted');
    // the seat moved sideways rather than appearing: the room is still full
    assert.equal(released.body.isFull, true);
  });
});

/** Every confirmed seat an attendee holds, as `[startsAt, endsAt, day]`, from the schedule payload. */
async function confirmedSlots(user) {
  const { days } = await api.json(`/users/${user}/schedule`);
  return days.flatMap((d) => d.sessions.filter((s) => s.reservation === 'confirmed'));
}

/** No two confirmed seats of one attendee overlap — the rule the whole feature protects. */
async function assertOneSeatPerSlot(user) {
  const held = await confirmedSlots(user);
  for (const a of held) {
    for (const b of held) {
      if (a.id < b.id) assert.ok(!overlaps(a, b), `attendee ${user} holds two seats in one slot: ${a.title} and ${b.title}`);
    }
  }
}

/**
 * A sold-out session B that `holder` has a real seat in, with a clashing session
 * A that is nearly full: at most four seats once the pool — everyone but the
 * holder and anyone else sitting in B — is off it, so a test can fill it with
 * the attendees it has. The seed guarantees one.
 */
async function cascadeFixture(skip) {
  const sessions = await api.json('/sessions');
  const people = await Promise.all(ATTENDEES.map((id) => api.json(`/users/${id}`)));
  const status = (p, sessionId) => p.reservations.find((r) => r.sessionId === sessionId)?.status ?? null;
  for (const b of sessions.filter((s) => s.isFull && !skip.has(s.id))) {
    const holder = people.find((p) => status(p, b.id) === 'confirmed');
    if (!holder) continue;
    const pool = people.filter((p) => p.id !== holder.id && status(p, b.id) !== 'confirmed');
    for (const a of sessions.filter((s) => !s.isFull && s.id !== b.id && overlaps(s, b))) {
      const left = a.seatsLeft + pool.filter((p) => status(p, a.id) === 'confirmed').length;
      if (left <= 4 && pool.length >= left + 1) return { b, a, holder: holder.id, pool: pool.map((p) => p.id) };
    }
  }
  return null;
}

/** A full session B and a clashing one with room, for one attendee to want both. */
async function clashingFullAndOpen() {
  const sessions = await api.json('/sessions');
  for (const full of sessions.filter((s) => s.isFull)) {
    const open = sessions.find((s) => !s.isFull && s.seatsLeft > 2 && overlaps(s, full));
    if (open) return { full, open };
  }
  return null;
}

/**
 * W queues on a full B while holding a clashing A; X queues behind with no
 * clash. `reuse` is the previous test's fixture: its promoted waiter now holds
 * B, so a second scenario can run on the same sold-out room.
 */
async function backupFixture(waiter, next, reuse) {
  await clearAgenda(api, waiter);
  await clearAgenda(api, next);
  let fixture = reuse;
  if (!fixture) {
    const found = await promotionFixture(used);
    assert.ok(found, 'the seed should leave a sold-out session with a real holder and a clashing open one');
    used.add(found.session.id);
    fixture = { a: found.clashing, b: found.session, holder: found.holder };
  }
  const { a, b, holder } = fixture;
  await emptyTheQueue(b.id);
  assert.equal((await api.put(`/users/${waiter}/reservations/${a.id}`)).body.status, 'confirmed');
  const queued = await api.put(`/users/${waiter}/reservations/${b.id}`);
  assert.equal(queued.status, 200, 'a full talk over a held backup queues the waiter');
  assert.equal(queued.body.status, 'waitlisted');
  assert.equal((await api.put(`/users/${next}/reservations/${b.id}`)).body.status, 'waitlisted');
  return { a, b, holder };
}

let afterClockCase; // the sold-out room the next case reuses, now held by its promoted waiter

describe('Waitlists and clashing seats', () => {
  test('both click orders end with the seat confirmed and the preferred talk waitlisted', async () => {
    const user = 2; // not 1: clearing a seat holder would unfill the rooms the fixtures below need
    await clearAgenda(api, user);
    const { full, open } = await clashingFullAndOpen(); // counts as they stand with the plan cleared
    assert.ok(full, 'the seed should offer a sold-out session with a clashing open one');
    const waiting = (await api.json(`/sessions/${full.id}`)).seats.waitlistCount;
    const seat = `/users/${user}/reservations/${open.id}`;
    const queue = `/users/${user}/reservations/${full.id}`;

    // book the backup, then queue for the talk you want
    assert.equal((await api.put(seat)).body.status, 'confirmed');
    const bookThenQueue = await api.put(queue);
    assert.equal(bookThenQueue.status, 200, 'queueing behind a held backup is not a clash');
    assert.equal(bookThenQueue.body.status, 'waitlisted');
    assert.equal(bookThenQueue.body.backup.id, open.id, 'the response names the seat that is kept');
    const first = {
      open: (await api.get(seat)).body, full: (await api.get(queue)).body,
    };

    // queue first, then book — the other way round
    await clearAgenda(api, user);
    assert.equal((await api.put(queue)).body.status, 'waitlisted');
    const queueThenBook = await api.put(seat);
    assert.equal(queueThenBook.status, 200);
    assert.equal(queueThenBook.body.status, 'confirmed');
    const second = {
      open: (await api.get(seat)).body, full: (await api.get(queue)).body,
    };

    for (const end of [first, second]) {
      assert.equal(end.open.status, 'confirmed');
      assert.equal(end.full.status, 'waitlisted');
      assert.equal(end.full.waitlistPosition, waiting + 1);
      assert.equal(end.open.seatsTaken, open.seatsTaken + 1);
      assert.equal(end.full.seatsTaken, full.seatsTaken);
    }
    assert.deepEqual(first, second, 'the order of the clicks leaves no trace');
    await assertOneSeatPerSlot(user);
  });

  test('promotion into the preferred talk frees the backup seat and promotes its queue', async () => {
    const fixture = await cascadeFixture(used);
    assert.ok(fixture, 'the seed should leave a sold-out session over a nearly full one');
    used.add(fixture.b.id);
    const { a, b, holder, pool } = fixture;
    const [w, v, ...fillers] = pool;
    for (const id of [w, v, ...fillers]) await clearAgenda(api, id);

    // A has L seats left: the fillers take all but one, W takes the last, V queues behind them
    const left = (await api.json(`/sessions/${a.id}`)).seats.seatsLeft;
    assert.ok(left >= 1 && left - 1 <= fillers.length, `A has ${left} seats left`);
    for (const id of fillers.slice(0, left - 1)) {
      assert.equal((await api.put(`/users/${id}/reservations/${a.id}`)).body.status, 'confirmed');
    }
    assert.equal((await api.put(`/users/${w}/reservations/${a.id}`)).body.status, 'confirmed');
    assert.equal((await api.put(`/users/${v}/reservations/${a.id}`)).body.status, 'waitlisted');
    assert.equal((await api.put(`/users/${w}/reservations/${b.id}`)).body.status, 'waitlisted');
    const full = { a: (await api.json(`/sessions/${a.id}`)).seats.seatsTaken, b: (await api.json(`/sessions/${b.id}`)).seats.seatsTaken };

    const released = await api.del(`/users/${holder}/reservations/${b.id}`);
    assert.equal(released.body.promoted, w, 'the freed seat in the preferred talk goes to the first waiter');
    assert.equal((await api.get(`/users/${w}/reservations/${b.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${w}/reservations/${a.id}`)).body.status, null, 'the backup is let go');
    // ...and the seat W let go is handed on by the same rule
    assert.equal((await api.get(`/users/${v}/reservations/${a.id}`)).body.status, 'confirmed');
    // seats moved sideways: both rooms are as full as they were
    assert.equal((await api.json(`/sessions/${a.id}`)).seats.seatsTaken, full.a);
    assert.equal((await api.json(`/sessions/${b.id}`)).seats.seatsTaken, full.b);
    for (const id of [w, v, holder]) await assertOneSeatPerSlot(id);
  });

  test('promotion skips a waiter whose backup has started on the clock sent, and promotes the next', async () => {
    const [waiter, next] = [3, 5];
    const { a, b, holder } = await backupFixture(waiter, next);
    afterClockCase = { a, b, holder: next };

    const released = await api.del(`/users/${holder}/reservations/${b.id}?day=${a.day}&time=${a.startsAt}`);
    assert.equal(released.body.promoted, next, 'the first waiter is already sitting in the backup');
    assert.equal((await api.get(`/users/${waiter}/reservations/${b.id}`)).body.status, 'waitlisted');
    assert.equal((await api.get(`/users/${waiter}/reservations/${a.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${next}/reservations/${b.id}`)).body.status, 'confirmed');
    await assertOneSeatPerSlot(waiter);
  });

  test('queueing for a full talk over a backup that has started still 409s overlap', async () => {
    const user = 2;
    await clearAgenda(api, user);
    const { full, open } = await clashingFullAndOpen();
    assert.equal((await api.put(`/users/${user}/reservations/${open.id}`)).body.status, 'confirmed');

    const res = await api.put(`/users/${user}/reservations/${full.id}`, { day: open.day, time: open.startsAt });
    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'overlap');
    assert.equal(res.body.conflictsWith.id, open.id);
    assert.equal(res.body.status, null, 'no waitlist place was written');
  });

  // These two come last: a check-in cannot be undone, and each outlives its test.
  test('promotion skips a waiter whose backup is checked in, even on a bare DELETE, and promotes the next', async () => {
    const [waiter, next] = [4, 6]; // 5 holds B by now, 3 is a bystander
    const { a, b, holder } = await backupFixture(waiter, next, afterClockCase);
    const checked = await api.put(`/users/${waiter}/checkins/${a.id}`, { day: a.day, time: shiftTime(a.startsAt, 5) });
    assert.equal(checked.body.checkedIn, true, 'the waiter is in the room');

    const released = await api.del(`/users/${holder}/reservations/${b.id}`);
    assert.equal(released.body.promoted, next);
    assert.equal((await api.get(`/users/${waiter}/reservations/${b.id}`)).body.status, 'waitlisted');
    assert.equal((await api.get(`/users/${waiter}/reservations/${a.id}`)).body.status, 'confirmed');
    assert.equal((await api.get(`/users/${next}/reservations/${b.id}`)).body.status, 'confirmed');
  });

  test('queueing for a full talk over a checked-in clash still 409s overlap', async () => {
    const user = 1;
    await clearAgenda(api, user);
    const { full, open } = await clashingFullAndOpen();
    assert.equal((await api.put(`/users/${user}/reservations/${open.id}`)).body.status, 'confirmed');
    const checked = await api.put(`/users/${user}/checkins/${open.id}`, { day: open.day, time: shiftTime(open.startsAt, 5) });
    assert.equal(checked.body.checkedIn, true);

    // no clock sent: the check-in alone is what protects the seat
    const res = await api.put(`/users/${user}/reservations/${full.id}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.rejected, 'overlap');
    assert.equal(res.body.conflictsWith.id, open.id);
    assert.equal((await api.get(`/users/${user}/reservations/${full.id}`)).body.status, null);
  });
});
