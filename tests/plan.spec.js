import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, bookableFor, shotForPR, ATTENDEES } from './helpers.js';

/** Hours are rounded per day and then summed, on the page and here alike. */
const hours = (minutes) => Math.round(minutes / 60);
const hoursOf = (days, field = 'totalMinutes') => days.reduce((n, d) => n + hours(d[field]), 0);

/**
 * Open My Agenda and hand back the `/schedule` payload the page rendered from.
 *
 * The expected numbers come from that response rather than from a second call:
 * the tiles total the whole conference, and other lanes book seats for these
 * attendees while this runs, so a fresh fetch could disagree with the screen
 * for reasons that have nothing to do with hours.
 */
async function openPlan(page, as) {
  const response = page.waitForResponse((r) => /\/api\/users\/\d+\/schedule/.test(r.url()) && r.ok());
  await visit(page, '/my-agenda', { as });
  const plan = await (await response).json();
  // wait for the plan itself, not just the shell, before reading any total
  if (plan.days.length) await expect(page.getByTestId(`plan-day-${plan.days[0].date}`)).toBeVisible();
  /*
   * A Stat counts up from zero once it is properly on screen, so a tile the
   * viewer has not reached yet reads 0 however long you wait for it — and a
   * speaker's "You are speaking" panel pushes this row to the very bottom of
   * the window. Centre it first, the way a reader scrolling to the numbers
   * would: `scrollIntoViewIfNeeded` is not enough, since a tile clipped by the
   * fold already counts as in view to it but not to the observer behind CountUp.
   */
  await page.getByTestId('stat-hours-booked').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  return plan;
}

/** `HH:MM` a few minutes after a session ends, for pinning the clock past it. */
function shortlyAfter(endsAt) {
  const mins = Number(endsAt.slice(0, 2)) * 60 + Number(endsAt.slice(3, 5)) + 5;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

test.describe('My Agenda', () => {
  test('the waitlist tile opens the sessions I am queued for, soonest first', async ({ page }, testInfo) => {
    const plan = await openPlan(page, ATTENDEES.amara);
    const queued = plan.days.flatMap((d) => d.sessions)
      .filter((s) => s.reservation === 'waitlisted')
      .sort((a, b) => a.day.localeCompare(b.day) || a.startsAt.localeCompare(b.startsAt));
    expect(queued.length, 'Amara must hold a waitlist place').toBeGreaterThan(0);

    const tile = page.getByTestId('stat-waitlist');
    await expect(tile.getByRole('button')).toBeVisible();
    await expect(page.getByTestId('waitlist-list')).toBeHidden();

    await tile.getByRole('button').click();
    const items = page.getByTestId('waitlist-list').locator('[data-testid^="waitlist-item-"]');
    await expect(items).toHaveCount(queued.length);
    for (const [i, s] of queued.entries()) {
      const item = items.nth(i);
      await expect(item).toHaveAttribute('data-testid', `waitlist-item-${s.id}`);
      await expect(item).toHaveAttribute('href', `/sessions/${s.id}`);
      await expect(item).toContainText(s.title);
      await expect(item).toContainText(new RegExp(`${Number(s.startsAt.slice(0, 2)) % 12 || 12}:${s.startsAt.slice(3)}`));
    }
    if (testInfo.project.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await shotForPR(page, 'the On a waitlist tile opened to the sessions I am queued for');

    await items.first().click();
    await expect(page.getByTestId('reservation-waitlisted')).toBeVisible();
  });

  test('the waitlist tile is plain text for someone on no waitlist', async ({ page }) => {
    await openPlan(page, ATTENDEES.jonas);
    await expect(page.getByTestId('stat-waitlist')).toContainText('0');
    await expect(page.getByTestId('stat-waitlist').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('waitlist-list')).toHaveCount(0);
  });

  test('leaving a waitlist updates the tile and list when I come back', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.waitlist', testInfo);
    const full = (await bookableFor(request, lane.user, lane.day)).find((s) => s.isFull && s.startsAt === lane.slot);
    expect(full, 'no full session this attendee can queue for').toBeTruthy();
    const url = `${API}/users/${lane.user}/reservations/${full.id}`;
    await request.delete(url);

    try {
      expect((await (await request.put(url)).json()).status).toBe('waitlisted');
      await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(0, '07:00') });
      const tile = page.getByTestId('stat-waitlist');
      await expect(tile.getByRole('button')).toBeVisible();
      const count = Number((await tile.innerText()).match(/\d+/)[0]);
      await tile.getByRole('button').click();
      await expect(page.getByTestId(`waitlist-item-${full.id}`)).toBeVisible();

      await page.getByTestId(`waitlist-item-${full.id}`).click();
      await page.getByTestId('release-seat').click();
      await expect(page.getByTestId('reserve-seat')).toBeVisible();

      await page.goBack();
      await expect(page.getByTestId('stat-hours-booked')).toBeVisible();
      await expect(page.getByTestId(`waitlist-item-${full.id}`)).toHaveCount(0);
      await expect(tile).toContainText(String(count - 1));
    } finally {
      await request.delete(`${API}/users/${lane.user}/reservations/${full.id}`);
    }
  });

  test('adding a session from the schedule puts it on the agenda', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.add', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/schedule?day=${lane.day}&view=list`, { as: lane.user, at: await momentOn(0, '07:00') });
    await expect(page.getByTestId('result-count')).not.toHaveText(/Loading/);

    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: target.title, exact: true }) });
    const seat = card.getByRole('button', { name: /agenda|waitlist/i });
    await expect(seat).toHaveAttribute('aria-pressed', 'false');
    await seat.click();
    await expect(seat).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-agenda');
    await expect(page.getByText(target.title, { exact: false }).first()).toBeVisible();

    // release only what this test booked — the rest of the day is seeded
    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });

  test('the hours tile totals the confirmed hours shown on each day', async ({ page }) => {
    const plan = await openPlan(page, ATTENDEES.sofia);
    expect(plan.days.length, 'needs a plan spanning several days to be worth summing').toBeGreaterThan(1);

    await expect(page.getByTestId('stat-hours-booked')).toHaveText(String(hoursOf(plan.days)));
    for (const day of plan.days) {
      await expect(page.getByTestId(`plan-day-${day.date}`))
        .toContainText(`${hours(day.totalMinutes)}h of content`);
    }
  });

  test('an attendee holding both kinds sees waitlisted time counted apart', async ({ page }) => {
    const plan = await openPlan(page, ATTENDEES.amara);
    const held = plan.days.flatMap((d) => d.sessions).map((s) => s.reservation);
    expect(held, 'Amara must hold a seat').toContain('confirmed');
    expect(held, 'Amara must hold a waitlist place').toContain('waitlisted');

    const booked = hoursOf(plan.days);
    const waiting = hoursOf(plan.days, 'waitlistedMinutes');
    await expect(page.getByTestId('stat-hours-booked')).toHaveText(String(booked));
    await expect(page.getByTestId('stat-hours-waitlisted')).toHaveText(`+${waiting}h waitlisted`);

    // the point of the ticket: the tile is lower than the old count-everything rule
    const everything = plan.days.reduce((n, d) => n + hours(d.totalMinutes + d.waitlistedMinutes), 0);
    expect(booked).toBeLessThan(everything);
  });

  test('an attendee on no waitlist sees nothing extra', async ({ page }) => {
    const plan = await openPlan(page, ATTENDEES.jonas);
    expect(plan.days.length, 'needs a plan to be worth reading').toBeGreaterThan(0);
    const held = plan.days.flatMap((d) => d.sessions).map((s) => s.reservation);
    expect(held, 'Jonas is the no-waitlist fixture').not.toContain('waitlisted');

    await expect(page.getByTestId('stat-hours-booked')).toBeVisible();
    await expect(page.getByTestId('stat-hours-waitlisted')).toHaveCount(0);
  });

  test('each attendee sees their own plan', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await expect(page.getByRole('heading', { name: /Sofia’s agenda/ })).toBeVisible();

    await visit(page, '/my-agenda', { as: ATTENDEES.kenji });
    await expect(page.getByRole('heading', { name: /Kenji’s agenda/ })).toBeVisible();
  });

  test('the switcher counts what is on an agenda, not what was "saved"', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.sofia });
    await page.getByRole('button', { name: /Switch attendee/ }).click();

    const option = page.getByRole('option', { name: /Sofia/ });
    await expect(option).toContainText(/[1-9]\d* on agenda/);
    await expect(option).not.toContainText(/saved/i);
  });

  test('the switcher\'s own row updates after booking or releasing a seat, without a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('switcher.live-count', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day))
      .find((s) => s.seatsLeft > 3 && (!lane.slot || s.startsAt === lane.slot));
    expect(target, 'nothing bookable in this lane').toBeTruthy();

    // Pin the clock: this lane books on day index 0, the live conference day, so
    // an unpinned clock projects the real time of day onto it — late enough and
    // the picked session already "ended", and reserveSeat 409s instead of
    // confirming. Every other booking test in this file pins for the same reason.
    await visit(page, `/sessions/${target.id}`, { as: lane.user, at: await momentOn(0, '07:00') });

    const digitOf = async (locator) => Number((await locator.textContent()).match(/(\d+) on agenda/)[1]);

    await page.getByRole('button', { name: /Switch attendee/ }).click();
    const ownRow = page.getByRole('option', { selected: true });
    const otherRow = page.getByRole('option', { selected: false }).first();
    const before = await digitOf(ownRow);
    const otherBefore = await digitOf(otherRow);
    await page.keyboard.press('Escape');

    await page.getByTestId('reserve-seat').click();
    await expect(page.getByTestId('reservation-confirmed')).toBeVisible();

    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(ownRow).toContainText(`${before + 1} on agenda`);
    await expect(otherRow).toContainText(`${otherBefore} on agenda`);
    await page.keyboard.press('Escape');

    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();

    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(ownRow).toContainText(`${before} on agenda`);
    await expect(otherRow).toContainText(`${otherBefore} on agenda`);
  });

  test('switching attendee in the header changes the plan', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.jonas });
    await expect(page.getByRole('heading', { name: /Jonas’s agenda/ })).toBeVisible();

    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByRole('option', { name: /Kenji Nakamura/ }).click();
    await expect(page.getByRole('heading', { name: /Kenji’s agenda/ })).toBeVisible();
  });

  test('the Right Now card counts a finished day in the singular', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.next-up-done', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day))
      .find((s) => s.startsAt === lane.slot && s.seatsLeft > 3);
    expect(target, 'nothing bookable in this lane\'s slot').toBeTruthy();

    await request.put(`${API}/users/${lane.user}/reservations/${target.id}`);

    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T${shortlyAfter(target.endsAt)}` });
    await expect(page.getByTestId('next-up')).toHaveText(
      'That is your day — 1 session done. Nothing else booked today.',
    );

    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });
});

test.describe('Speaker view', () => {
  test('a speaking attendee sees their own sessions', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.amara });
    const panel = page.getByTestId('speaking-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('You are speaking');
    await expect(panel.getByRole('link')).not.toHaveCount(0);
  });

  test('a non-speaking attendee sees no speaker panel', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.kenji });
    await expect(page.getByTestId('speaking-panel')).toHaveCount(0);
  });
});

test.describe('What is left to rate', () => {
  /*
   * On Day 2 the home page only talks about Day 2, so My Agenda is where a
   * Day 1 talk you sat through but never rated still gets asked about.
   */
  test('lists a checked-in, unrated session from an earlier day, and not a rated one', async ({ page, request }, testInfo) => {
    const { user, day, slot } = await laneFor('agenda.to-rate', testInfo);
    const plan = await (await request.get(`${API}/users/${user}/schedule`)).json();
    const onDay = plan.days.find((d) => d.date === day)?.sessions ?? [];
    const target = onDay.find((s) => s.startsAt === slot && s.reservation === 'confirmed');
    expect(target, `the seed gives attendee ${user} a seat at ${slot} on Day 1`).toBeTruthy();
    const rated = onDay.find((s) => s.reservation === 'confirmed' && s.myStars != null);
    expect(rated, `the seed gives attendee ${user} a rated Day 1 session`).toBeTruthy();

    const checked = await request.put(`${API}/users/${user}/checkins/${target.id}`, {
      data: { day, time: target.startsAt },
    });
    expect(checked.ok()).toBeTruthy();

    await visit(page, '/my-agenda', { as: user, at: await momentOn(1, '10:30') });

    const callout = page.getByTestId('to-rate');
    await expect(callout).toBeVisible();
    await expect(callout.locator(`a[href="/sessions/${target.id}"]`)).toBeVisible();
    await expect(callout.locator(`a[href="/sessions/${rated.id}"]`)).toHaveCount(0);

    const dayPlan = page.getByTestId(`plan-day-${day}`);
    const rowOf = (s) => dayPlan.getByTestId('session-card')
      .filter({ has: page.locator(`h3`, { hasText: s.title }) });
    const targetStatus = rowOf(target).getByTestId('attendance-status');
    await expect(targetStatus).toContainText('Checked in');
    await expect(targetStatus.getByRole('link', { name: /rate/i })).toHaveAttribute('href', `/sessions/${target.id}`);
    await expect(rowOf(rated).getByTestId('attendance-status')).toContainText(`Rated ★${rated.myStars}`);

    await callout.scrollIntoViewIfNeeded();
    await shotForPR(page, 'my-agenda-to-rate');
  });

  test('claims no attendance for a session that has not opened yet', async ({ page }) => {
    // The seed rates Marcus's Day 1 morning; at 08:00 on Day 1 none of it has
    // happened, so no row may say Rated, Checked in or Missed — found by QA on #89.
    await visit(page, '/my-agenda', { as: ATTENDEES.marcus, at: await momentOn(0, '08:00') });
    await expect(page.getByTestId('session-card').first()).toBeVisible();
    await expect(page.getByTestId('attendance-status')).toHaveCount(0);
  });

  test('shows no callout when everything attended is rated', async ({ page }) => {
    // Marcus rated every seeded check-in; no lane checks him in to a seat he holds.
    await visit(page, '/my-agenda', { as: ATTENDEES.marcus, at: await momentOn(1, '10:30') });
    await expect(page.getByTestId('attendance-status').filter({ hasText: 'Rated ★' }).first()).toBeVisible();
    await expect(page.getByTestId('to-rate')).toHaveCount(0);
  });
});
