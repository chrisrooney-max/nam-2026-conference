import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, bookableFor, shotForPR, ATTENDEES } from './helpers.js';


/**
 * Start from "not reserved" on the open session page. bookableFor() only picks
 * sessions the attendee holds nothing on, so this is a guard, not a reset: if a
 * seat is somehow already held, release it rather than fail on a missing button.
 */
async function ensureNotReserved(page) {
  const release = page.getByTestId('release-seat');
  if (await release.isVisible().catch(() => false)) {
    await release.click();
    await page.getByTestId('reserve-seat').waitFor();
  }
}

/**
 * A session with spare seats in this test's own slot. Seat counts are shared
 * server state and every test runs concurrently, so each lane owns a slot that
 * nobody else books in — see LANES in helpers.js.
 */
async function openSessionFor(request, lane) {
  const sessions = await bookableFor(request, lane.user, lane.day);
  return sessions.find((s) => s.startsAt === lane.slot && s.seatsLeft > 3);
}

/**
 * A full session where Jonas holds a confirmed seat and no other test attendee
 * does — so clearing everyone else off it frees no seat — and where Kenji holds
 * nothing in the same slot, so he can queue for it. The seed guarantees one.
 */
async function findPromotionFixture(request) {
  const all = await (await request.get(`${API}/sessions`)).json();
  const people = await Promise.all(Object.values(ATTENDEES).map(async (id) =>
    (await request.get(`${API}/users/${id}`)).json()));
  const confirmed = (p, id) => p.reservations.some((r) => r.sessionId === id && r.status === 'confirmed');

  for (const s of all.filter((x) => x.isFull)) {
    const holders = people.filter((p) => confirmed(p, s.id)).map((p) => p.id);
    if (holders.length !== 1 || holders[0] !== ATTENDEES.jonas) continue;
    const kenjiCanQueue = (await bookableFor(request, ATTENDEES.kenji, s.day)).some((b) => b.id === s.id);
    if (kenjiCanQueue) return s.id;
  }
  return null;
}

test.describe('Seat reservation', () => {
  test('releasing gives the seat back, and offers Undo only while the session can still be joined', async ({ page, request }, testInfo) => {
    const lane = await laneFor('seats.count', testInfo);
    const open = await openSessionFor(request, lane);
    expect(open, `no open session at ${lane.slot}`).toBeTruthy();

    await visit(page, `/sessions/${open.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    await ensureNotReserved(page);

    const count = page.getByTestId('seat-count');
    const toaster = page.getByTestId('toaster');
    const start = await count.innerText();

    await page.getByTestId('reserve-seat').click();
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();
    await expect(count).not.toHaveText(start);
    const held = await count.innerText();

    // Day 1, 07:00: the session has not started, so Undo is offered and works.
    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();
    await expect(count).toHaveText(start);
    await toaster.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();
    await expect(count).toHaveText(held);

    // Same seat, same session, but now the session is over: the API would
    // refuse to give the seat back, so no Undo may be offered.
    await page.goto(`/sessions/${open.id}?at=${lane.day}T23:30`);
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();
    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('session-ended-seat')).toBeVisible();
    await expect(toaster.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(toaster).toContainText('Removed from your agenda');
    await shotForPR(page, 'removing an ended seat offers no Undo');

    await expect(count).toHaveText(start); // no leaked seat
  });

  test('a reservation is server state and survives a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('seats.reload', testInfo);
    const open = await openSessionFor(request, lane);
    expect(open, `no open session at ${lane.slot}`).toBeTruthy();

    await visit(page, `/sessions/${open.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    await ensureNotReserved(page);

    await page.getByTestId('reserve-seat').click();
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();
    const held = await page.getByTestId('seat-count').innerText();

    await page.reload();
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();
    await expect(page.getByTestId('seat-count')).toHaveText(held);

    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();
  });

  test('a full session offers the waitlist instead of a seat', async ({ page, request }, testInfo) => {
    const lane = await laneFor('seats.waitlist', testInfo);
    const full = (await bookableFor(request, lane.user, lane.day)).find((s) => s.isFull);
    expect(full, 'no full session this attendee can queue for').toBeTruthy();

    await visit(page, `/sessions/${full.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    await ensureNotReserved(page);
    await expect(page.getByTestId('seats-left')).toContainText('Full');
    await expect(page.getByTestId('reserve-seat')).toContainText(/waitlist/i);

    await page.getByTestId('reserve-seat').click();
    await expect(page.getByTestId('reservation-waitlisted')).toBeVisible();
    // joining a waitlist must not consume a seat
    await expect(page.getByTestId('seats-left')).toContainText('Full');

    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();
  });

  test('reserving twice does not take two seats', async ({ request }, testInfo) => {
    const lane = await laneFor('seats.twice', testInfo);
    const open = await openSessionFor(request, lane);
    expect(open, `no open session at ${lane.slot}`).toBeTruthy();
    const url = `${API}/users/${lane.user}/reservations/${open.id}`;

    const first = await (await request.put(url)).json();
    const second = await (await request.put(url)).json();
    expect(second.seatsTaken).toBe(first.seatsTaken);
    expect(second.status).toBe('confirmed');

    await request.delete(url);
  });

  test('releasing a seat promotes whoever waited longest', async ({ request }, testInfo) => {
    // Mutates one shared fixture session, so only one project runs it.
    test.skip(testInfo.project.name !== 'desktop', 'single-project test');
    const sessionId = await findPromotionFixture(request);
    expect(sessionId, 'the seed should leave a full session held only by Jonas').toBeTruthy();

    const waiter = `${API}/users/${ATTENDEES.kenji}/reservations/${sessionId}`;
    const holder = `${API}/users/${ATTENDEES.jonas}/reservations/${sessionId}`;

    // Take everyone else out of the queue so the promotion order is unambiguous,
    // remembering who was there. Nobody else holds a confirmed seat on the
    // fixture, so this frees no seat.
    const others = Object.values(ATTENDEES).filter((id) => id !== ATTENDEES.jonas);
    const queuedBefore = [];
    for (const id of others) {
      const state = await (await request.get(`${API}/users/${id}/reservations/${sessionId}`)).json();
      if (state.status === 'waitlisted' && id !== ATTENDEES.kenji) queuedBefore.push(id);
      await request.delete(`${API}/users/${id}/reservations/${sessionId}`);
    }

    const queued = await (await request.put(waiter)).json();
    expect(queued.status).toBe('waitlisted');

    // The seeded holder gives up their confirmed seat.
    const released = await (await request.delete(holder)).json();
    expect(released.promoted).toBe(ATTENDEES.kenji);

    // Kenji now holds a real seat, and the room is still full.
    const after = await (await request.get(waiter)).json();
    expect(after.status).toBe('confirmed');
    expect(after.isFull).toBeTruthy();

    // put the fixture back: Kenji's seat returns to Jonas, and the queue re-forms
    await request.delete(waiter);
    expect((await (await request.put(holder)).json()).status).toBe('confirmed');
    for (const id of queuedBefore) {
      expect((await (await request.put(`${API}/users/${id}/reservations/${sessionId}`)).json()).status)
        .toBe('waitlisted');
    }
  });
});

test.describe('Waitlists', () => {
  test('the programme actually contains full sessions with queues', async ({ request }) => {
    const all = await (await request.get(`${API}/sessions`)).json();
    const full = all.filter((s) => s.isFull);
    expect(full.length, 'no sold-out sessions to waitlist onto').toBeGreaterThan(3);
    expect(full.some((s) => s.waitlistCount > 0), 'no session has a queue').toBeTruthy();
  });

  test('a full session shows the queue length in the listing', async ({ page, request }, testInfo) => {
    // Join the queue ourselves rather than borrowing a seeded one: releasing a
    // confirmed seat promotes the longest waiter, so another test running at the
    // same time can empty a queue this one was counting on.
    const desktop = testInfo.project.name === 'desktop';
    const user = desktop ? ATTENDEES.sofia : ATTENDEES.marcus;
    const all = await (await request.get(`${API}/sessions`)).json();
    const candidates = all.filter((s) => s.isFull);
    if (!desktop) candidates.reverse();

    let queued;
    for (const session of candidates) {
      const res = await request.put(`${API}/users/${user}/reservations/${session.id}`);
      const state = await res.json();
      if (state.status === 'waitlisted') { queued = session; break; }
      // an overlapping seat elsewhere — that session is not ours to queue on
      if (state.status) await request.delete(`${API}/users/${user}/reservations/${session.id}`);
    }
    expect(queued, 'no full session this attendee could queue on').toBeTruthy();

    await visit(page, `/schedule?day=${queued.day}&view=list`, { as: user });
    const card = page.locator('article').filter({ hasText: queued.title }).first();
    await expect(card).toContainText(/Full · \d+ waiting/);

    await request.delete(`${API}/users/${user}/reservations/${queued.id}`);
  });

  test('joining a queue reports a position behind the people already there', async ({ page, request }, testInfo) => {
    const lane = await laneFor('seats.queue', testInfo);
    const queued = (await bookableFor(request, lane.user, lane.day))
      .find((s) => s.isFull && s.waitlistCount > 0);
    expect(queued, 'no queue this attendee can join').toBeTruthy();

    await visit(page, `/sessions/${queued.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
    await ensureNotReserved(page);

    await page.getByTestId('reserve-seat').click();
    const panel = page.getByTestId('reservation-waitlisted');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Position \d+ of \d+/);
    await expect(panel).toContainText(/ahead of you|next in line/);

    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();
  });

  test('queueing behind a held seat tells you the seat is kept as backup', async ({ page, request }, testInfo) => {
    const lane = await laneFor('seats.backup', testInfo);
    const sessions = await bookableFor(request, lane.user, lane.day);
    const wanted = sessions.find((s) => s.isFull && s.startsAt === lane.slot);
    expect(wanted, `no sold-out session at ${lane.slot}`).toBeTruthy();
    const backup = sessions.find((s) => !s.isFull && s.seatsLeft > 3 && s.id !== wanted.id
      && s.startsAt < wanted.endsAt && wanted.startsAt < s.endsAt);
    expect(backup, 'no open session clashing with the sold-out one').toBeTruthy();
    const url = (id) => `${API}/users/${lane.user}/reservations/${id}`;

    expect((await (await request.put(url(backup.id))).json()).status).toBe('confirmed');
    try {
      await visit(page, `/sessions/${wanted.id}`, { as: lane.user, at: await momentOn(0, '07:00') });
      await ensureNotReserved(page);
      await page.getByTestId('reserve-seat').click();

      // a queue place, not a conflict dialog — and the toast says which seat is kept
      await expect(page.getByTestId('reservation-waitlisted')).toBeVisible();
      await expect(page.getByTestId('conflict-dialog')).toHaveCount(0);
      const toaster = page.getByTestId('toaster');
      await expect(toaster).toContainText(/waitlist/i);
      await expect(toaster).toContainText(backup.title);
      await expect(toaster).toContainText(/until a place opens/i);
      await shotForPR(page, 'Queued behind a held seat, which is kept as backup');
    } finally {
      await request.delete(url(wanted.id));
      await request.delete(url(backup.id));
    }
  });
});
