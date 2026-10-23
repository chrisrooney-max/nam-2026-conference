import { test, expect } from '@playwright/test';
import { API, visit, momentOn, waitForResults, conferenceDays, laneFor, bookableFor, MID_SESSION_TIME, ATTENDEES, shotForPR } from './helpers.js';


test.describe('Schedule', () => {
  test('lists sessions for the selected day', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);
    await expect(page.getByTestId('result-count')).toContainText(/\d+ sessions/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('the agenda line names the selected day instead of assuming today', async ({ page }) => {
    const days = await conferenceDays();
    const rail = page.getByTestId('starred-count').locator('..');

    await visit(page, '/schedule', { at: await momentOn(0, MID_SESSION_TIME) });
    await expect(rail).toContainText('today');

    await visit(page, `/schedule?day=${days[1]}`, { at: await momentOn(0, MID_SESSION_TIME) });
    await expect(rail).toContainText('on Day 2');
    await expect(rail).not.toContainText('today');
  });

  test('switching day changes the results', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);
    const first = await page.getByTestId('result-count').textContent();

    // the filter rail is collapsed on narrow viewports
    const filters = page.getByRole('button', { name: /^Filters/ });
    if (await filters.isVisible()) await filters.click();
    const days = await conferenceDays();
    await page.getByTestId(`tab-${days[2]}`).click();
    await waitForResults(page);
    await expect(page).toHaveURL(new RegExp(`day=${days[2]}`));
    await expect(page.getByTestId('result-count')).not.toHaveText(first);
  });

  test('search narrows the list and survives a reload', async ({ page }) => {
    await visit(page, '/schedule?view=list');
    await waitForResults(page);

    const filtersBtn = page.getByRole('button', { name: /^Filters/ });
    if (await filtersBtn.isVisible()) await filtersBtn.click();
    await page.getByTestId('search-input').fill('agents');
    await waitForResults(page);
    const count = await page.getByTestId('result-count').textContent();
    expect(count).not.toContain('Loading');

    await expect(page).toHaveURL(/q=agents/);
    await page.reload();
    const reopened = page.getByRole('button', { name: /^Filters/ });
    if (await reopened.isVisible()) await reopened.click();
    await expect(page.getByTestId('search-input')).toHaveValue('agents');
  });

  test('filtering by venue only returns that venue', async ({ page }) => {
    await visit(page, '/schedule?venue=2&view=list');
    await waitForResults(page);
    // Everything at the Foundry carries the cross-town chip.
    const cards = page.locator('article');
    await expect(cards.first()).toContainText('Foundry');
  });

  test('an impossible filter combination shows the empty state', async ({ page }) => {
    await visit(page, '/schedule?q=zzzznotathing&view=list');
    await expect(page.getByRole('heading', { name: /No sessions match/i })).toBeVisible();
  });

  test('an empty search names what was searched for', async ({ page }) => {
    await visit(page, '/schedule?q=zzqx&view=list');
    await expect(page.getByRole('heading', { name: 'No sessions match “zzqx”', exact: true })).toBeVisible();
    await shotForPR(page, 'the empty state naming the search');
  });

  test('filters without a search keep the plain empty-state heading', async ({ page, request }) => {
    const days = await conferenceDays();
    const { tracks } = await (await request.get(`${API}/bootstrap`)).json();
    let pick = null;
    for (const day of days) {
      for (const t of tracks) {
        const found = await (await request.get(`${API}/sessions?day=${day}&trackSlug=${t.slug}`)).json();
        const list = Array.isArray(found) ? found : found.sessions;
        if (list.length === 0) { pick = { day, slug: t.slug }; break; }
      }
      if (pick) break;
    }
    test.skip(!pick, 'every track has sessions on every day');
    await visit(page, `/schedule?day=${pick.day}&track=${pick.slug}&view=list`);
    await expect(page.getByRole('heading', { name: 'No sessions match', exact: true })).toBeVisible();
  });

  test('Clear filters clears the search and brings sessions back', async ({ page }) => {
    await visit(page, '/schedule?q=zzqx&view=list');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.locator('article').first()).toBeVisible();
  });
});

test.describe('Schedule track filter', () => {
  // Read-only, so no data lane. The day is named in the URL and the clock is
  // pinned, so the counts never depend on the hour the test runs.
  test('tracks can be added and removed, and the URL, count and list follow', async ({ page, request }) => {
    const days = await conferenceDays();
    const day = days[0];
    const { tracks } = await (await request.get(`${API}/bootstrap`)).json();
    const countFor = async (slugs) => {
      const q = slugs.length ? `&trackSlug=${slugs.join(',')}` : '';
      return (await (await request.get(`${API}/sessions?day=${day}${q}`)).json()).length;
    };
    const populated = [];
    for (const t of tracks) if (await countFor([t.slug]) > 0) populated.push(t);
    expect(populated.length).toBeGreaterThanOrEqual(2);
    const [a, b] = populated;
    const pill = (t) => page.getByRole('complementary', { name: 'Schedule filters' })
      .getByRole('button', { name: t.shortName ?? t.name, exact: true });
    const count = page.getByTestId('result-count');
    const expectCount = async (slugs) => {
      const n = await countFor(slugs);
      await expect(count).toHaveText(`${n} ${n === 1 ? 'session' : 'sessions'}`);
    };

    await visit(page, `/schedule?day=${day}&view=list`, { at: await momentOn(0, MID_SESSION_TIME) });
    await waitForResults(page);
    const filtersBtn = page.getByRole('button', { name: /^Filters/ });
    if (await filtersBtn.isVisible()) await filtersBtn.click();
    const everything = await countFor([]);
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // one track: as before
    await pill(a).click();
    await expect(page).toHaveURL(new RegExp(`track=${a.slug}(&|$)`));
    await expect(pill(a)).toHaveAttribute('aria-pressed', 'true');
    await expectCount([a.slug]);

    // add a second
    await pill(b).click();
    await expect(pill(a)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(b)).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(new RegExp(`track=${a.slug}(,|%2C)${b.slug}(&|$)`));
    await expectCount([a.slug, b.slug]);
    for (const card of await page.getByTestId('session-card').all()) {
      await expect(card).toContainText(new RegExp(`${a.name}|${b.name}|${a.shortName ?? a.name}|${b.shortName ?? b.name}`));
    }
    await shotForPR(page, 'two tracks selected in the schedule filter');

    // the selection survives a reload
    await page.reload();
    await waitForResults(page);
    const reopened = page.getByRole('button', { name: /^Filters/ });
    if (await reopened.isVisible()) await reopened.click();
    await expect(pill(a)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(b)).toHaveAttribute('aria-pressed', 'true');
    await expectCount([a.slug, b.slug]);

    // remove the first: only the second is left
    await pill(a).click();
    await expect(pill(a)).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(new RegExp(`track=${b.slug}(&|$)`));
    await expectCount([b.slug]);

    // removing the last one is the same as All
    await pill(b).click();
    await expect(page).not.toHaveURL(/track=/);
    await expectCount([]);
    await expect(count).toHaveText(`${everything} ${everything === 1 ? 'session' : 'sessions'}`);

    // All clears a multi-selection in one go
    await pill(a).click();
    await pill(b).click();
    await expectCount([a.slug, b.slug]);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).not.toHaveURL(/track=/);
    await expect(pill(a)).toHaveAttribute('aria-pressed', 'false');
    await expect(pill(b)).toHaveAttribute('aria-pressed', 'false');
    await expectCount([]);
  });

  test('two or more tracks drop the grid to the list, as one does', async ({ page, request }) => {
    const days = await conferenceDays();
    const { tracks } = await (await request.get(`${API}/bootstrap`)).json();
    const [a, b] = tracks;
    const at = await momentOn(0, MID_SESSION_TIME);

    await visit(page, `/schedule?day=${days[0]}&view=grid&track=${a.slug}`, { at });
    await waitForResults(page);
    await expect(page.getByTestId('grid-blocked-notice')).toBeVisible();
    await expect(page.getByTestId('schedule-grid')).toHaveCount(0);

    await page.goto(`/schedule?day=${days[0]}&view=grid&track=${a.slug},${b.slug}`);
    await waitForResults(page);
    await expect(page.getByTestId('grid-blocked-notice')).toBeVisible();
    await expect(page.getByTestId('schedule-grid')).toHaveCount(0);
    await expect(page.getByTestId('view-grid')).toBeDisabled();
  });
});

test.describe('Schedule grid', () => {
  test('the grid lays sessions out by time and room', async ({ page }) => {
    await visit(page, '/schedule?view=grid');
    const grid = page.getByTestId('schedule-grid');
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('columnheader').first()).toBeVisible();
    // the keynote is not in a room column — it spans the whole width
    await expect(grid.getByText('Keynote').first()).toBeVisible();
  });

  test('switching view swaps the layout and stays in the URL', async ({ page }) => {
    await visit(page, '/schedule?view=grid');
    await expect(page.getByTestId('schedule-grid')).toBeVisible();

    await page.getByTestId('view-list').click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByTestId('schedule-grid')).toHaveCount(0);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('adding from a grid cell updates the agenda count', async ({ page, request }, testInfo) => {
    // Seat state is shared and everything runs concurrently, so this books in
    // its own lane and releases only the session it added.
    const lane = await laneFor('schedule.grid', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
    expect(target, 'nothing this attendee can add').toBeTruthy();

    await visit(page, `/schedule?view=grid&day=${lane.day}`, { as: lane.user, at: await momentOn(0, '07:00') });
    const count = page.getByTestId('starred-count');
    await expect(page.getByTestId('schedule-grid')).toBeVisible();
    const before = Number(await count.innerText());

    await page.getByTestId('schedule-grid')
      .getByRole('button', { name: `Add ${target.title} to my agenda`, exact: true }).click();
    await expect(count).toHaveText(String(before + 1));

    await request.delete(`${API}/users/${lane.user}/reservations/${target.id}`);
  });

  test('a card shows the seats left, and a full one says Full instead', async ({ page, request }, testInfo) => {
    // Read-only: it books nothing, so it needs no cleanup. Seat counts are
    // global though, so it asserts the shape of the count and not a number
    // another lane is free to move while this runs.
    const lane = await laneFor('schedule.seats', testInfo);
    const all = await (await request.get(`${API}/sessions?day=${lane.day}`)).json();
    const roomy = all.find((s) => !s.isKeynote && s.seatsLeft > 50);
    const full = all.find((s) => !s.isKeynote && s.isFull);
    expect(roomy, 'no session with room to spare').toBeTruthy();
    expect(full, 'no sold-out session on this day').toBeTruthy();

    await visit(page, `/schedule?day=${lane.day}&view=list`, { as: lane.user });
    await waitForResults(page);
    const cardFor = (title) => page.locator('article').filter({ hasText: title }).first();

    await expect(cardFor(roomy.title).getByTestId('card-seats')).toHaveText(/^\d+ seats left$/);
    await expect(cardFor(full.title).getByTestId('card-seats')).toContainText('Full');
  });
});

test.describe('Ended sessions', () => {
  test('a past day\'s cards cannot be booked and read as done', async ({ page }) => {
    // Read-only: nothing here can reach the API, so no lane is needed.
    const days = await conferenceDays();
    const at = await momentOn(1, '10:00');
    const reservationCalls = [];
    page.on('request', (req) => { if (req.url().includes('/reservations')) reservationCalls.push(req.url()); });

    await visit(page, `/schedule?view=list&day=${days[0]}`, { as: ATTENDEES.marcus, at });
    await waitForResults(page);
    const cards = page.getByTestId('session-card');
    await expect(cards.first()).toBeVisible();

    const ended = cards.getByRole('button', { name: /ended/i }).first();
    await expect(ended).toBeVisible();
    await expect(ended).toBeDisabled();
    await ended.click({ force: true });
    await page.waitForTimeout(300);
    expect(reservationCalls).toEqual([]);
    await expect(page.getByTestId('toaster')).toHaveText('');

    const done = await cards.evaluateAll((els) => els.map((el) => el.dataset.done));
    expect(done.length).toBeGreaterThan(0);
    expect(done.every((d) => d === 'true')).toBe(true);
    await shotForPR(page, 'ended-cards');

    await visit(page, `/schedule?view=list&day=${days[2]}`, { as: ATTENDEES.marcus, at });
    await waitForResults(page);
    await expect(page.getByTestId('session-card').first()).toHaveAttribute('data-done', 'false');
  });

  test('the grid disables the banner and cell seat buttons for ended sessions', async ({ page }) => {
    // Read-only: nothing here can reach the API, so no lane is needed.
    const days = await conferenceDays();
    const at = await momentOn(1, '10:00');
    const reservationCalls = [];
    page.on('request', (req) => { if (req.url().includes('/reservations')) reservationCalls.push(req.url()); });

    await visit(page, `/schedule?view=grid&day=${days[0]}`, { as: ATTENDEES.marcus, at });
    const grid = page.getByTestId('schedule-grid');
    await expect(grid).toBeVisible();

    const banner = grid.getByRole('button', { name: 'Session ended' }).first();
    await expect(banner).toBeVisible();
    await expect(banner).toBeDisabled();
    await banner.click({ force: true });

    const cell = grid.getByRole('button', { name: /has ended$/i }).first();
    await expect(cell).toBeVisible();
    await expect(cell).toBeDisabled();
    await cell.click({ force: true });

    await page.waitForTimeout(300);
    expect(reservationCalls).toEqual([]);
    await expect(page.getByTestId('toaster')).toHaveText('');
  });

  test('on a phone the open filter rail leaves the first session in view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the rail is only collapsed behind a button on phones');
    const days = await conferenceDays();
    await visit(page, '/schedule?view=list', { at: await momentOn(0, MID_SESSION_TIME) });
    await waitForResults(page);
    await page.getByRole('button', { name: /^Filters/ }).click();

    await expect(page.locator('article').first()).toBeInViewport();
    await shotForPR(page, 'open filter rail');

    // compacting must not drop a filter
    await page.getByTestId('search-input').fill('a');
    for (const d of days) await expect(page.getByTestId(`tab-${d}`)).toBeVisible();
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await expect(page).toHaveURL(/track=/);
    for (const l of ['Venue', 'Level', 'Format', 'Topic']) await expect(page.getByLabel(l)).toBeVisible();
  });
});
