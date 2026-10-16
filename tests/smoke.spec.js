import { test, expect } from '@playwright/test';
import { API, visit, failOnPageErrors, waitForResults, ATTENDEES, shotForPR } from './helpers.js';

/**
 * Smoke suite: every route renders, with no console errors and no horizontal
 * overflow. Runs on desktop and mobile. If a change breaks the app shell,
 * this is what catches it.
 */

const ROUTES = [
  { path: '/', name: 'Home', heading: /Your day|Not started|Happening right now|changing rooms|is done/i },
  { path: '/schedule', name: 'Schedule', heading: /The schedule/i },
  { path: '/speakers', name: 'Speakers', heading: /^Speakers$/i },
  { path: '/my-agenda', name: 'My Agenda', heading: /agenda$/i },
  { path: '/venues', name: 'Venues', heading: /Venues & stages/i },
  { path: '/food', name: 'Food', heading: /Food & drink/i },
  { path: '/expo', name: 'Expo', heading: /Partners & sponsors/i },
  { path: '/code-of-conduct', name: 'Code of conduct', heading: /Code of conduct/i },
  { path: '/accessibility', name: 'Accessibility', heading: /^Accessibility$/i },
];

for (const route of ROUTES) {
  test(`${route.name} renders cleanly`, async ({ page }) => {
    const errors = failOnPageErrors(page);
    await visit(page, route.path);

    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    // No horizontal scroll at any viewport — the app must stay responsive.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route.name} scrolls horizontally`).toBeLessThanOrEqual(1);

    expect(errors, `${route.name} logged console errors`).toEqual([]);
  });
}

test('unknown routes show the not-found page', async ({ page }) => {
  await visit(page, '/definitely-not-a-page');
  await expect(page.getByRole('heading', { name: /Nothing scheduled here/i })).toBeVisible();
});

test('the API is reachable and seeded', async ({ request }) => {
  const res = await request.get(`${API}/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  // asserts the database is seeded, not a particular programme size
  expect(body.sessions).toBeGreaterThan(100);
});

test('every link in the footer resolves', async ({ page }) => {
  await visit(page, '/');
  const hrefs = await page.getByRole('contentinfo').getByRole('link')
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')))]);

  for (const href of hrefs.filter((h) => h?.startsWith('/') && !h.startsWith('/api'))) {
    await visit(page, href);
    await expect(page.getByRole('heading', { name: /Nothing scheduled here/i })).toHaveCount(0);
  }
});

test('the venues page switches venue and shows a live room board', async ({ page }) => {
  await visit(page, '/venues');
  const venues = page.locator('[data-testid^="venue-tab-"]');
  await expect(venues).toHaveCount(2);

  const first = page.locator('[data-testid^="venue-board-"]');
  await expect(first).toBeVisible();
  const beforeId = await first.getAttribute('data-testid');

  await venues.nth(1).click();
  await expect(page.locator('[data-testid^="venue-board-"]')).not.toHaveAttribute('data-testid', beforeId);
});

test.describe('Nothing claims to be true when it is not', () => {
  test('no session in the future carries a rating', async ({ request }) => {
    const bootstrap = await (await request.get(`${API}/bootstrap`)).json();
    const today = bootstrap.days[0].date;
    const sessions = await (await request.get(`${API}/sessions`)).json();

    const liars = sessions.filter((s) => s.ratingCount > 0 && s.day > today);
    expect(liars.map((s) => `${s.day} ${s.title}`)).toEqual([]);
  });

  test('only speakers with a keynote are badged as keynote speakers', async ({ request }) => {
    const speakers = await (await request.get(`${API}/speakers`)).json();
    const sessions = await (await request.get(`${API}/sessions`)).json();
    const keynoteSpeakerIds = new Set(
      sessions.filter((s) => s.isKeynote).flatMap((s) => s.speakers.map((sp) => sp.id)));

    for (const s of speakers.filter((x) => x.keynoteCount > 0)) {
      expect(keynoteSpeakerIds.has(s.id), `${s.name} claims a keynote`).toBeTruthy();
    }
  });

  test('the app never links to a domain we invented', async ({ request }) => {
    const sessions = await (await request.get(`${API}/sessions`)).json();
    const invented = sessions.filter((s) => s.recordingUrl || s.slidesUrl || s.repoUrl);
    expect(invented.map((s) => s.title)).toEqual([]);
  });

  test('a speaker profile shows handles as text, not as links to domains that do not exist', async ({ page, request }) => {
    const speakers = await (await request.get(`${API}/speakers`)).json();
    const speaker = speakers.find((s) => s.socials?.website) ?? speakers.find((s) => s.socials?.twitter);
    expect(speaker, 'no speaker has socials to render').toBeTruthy();

    await visit(page, `/speakers/${speaker.id}`);
    const detail = page.getByTestId('speaker-detail');
    await expect(detail).toBeVisible();
    // the handle is on the page…
    await expect(detail).toContainText(
      (speaker.socials.website ?? speaker.socials.twitter).replace(/^https?:\/\//, ''));
    // …and nothing on it leaves the app
    await expect(detail.locator('a[href^="http"]')).toHaveCount(0);
  });

  test('the footer dates match the seeded conference', async ({ page }) => {
    const bootstrap = await (await page.request.get(`${API}/bootstrap`)).json();
    await visit(page, '/');
    await expect(page.getByRole('contentinfo')).toContainText(bootstrap.conference.dates);
  });
});

test('user switcher dropdown is opaque', async ({ page }) => {
  // The schedule is the busiest page, so there is plenty to show through.
  await visit(page, '/schedule');
  await page.getByRole('button', { name: /Viewing as/ }).click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  const surface = await listbox.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, backdrop: s.backdropFilter };
  });
  // Fully opaque is `rgb(...)`; any alpha makes it `rgba(...)` and lets the page through.
  expect(surface.background).toMatch(/^rgb\(/);
  // A blur over a translucent fill is the glass look this panel must not have.
  expect(surface.backdrop).toBe('none');

  await shotForPR(page, 'User switcher on an opaque surface');
});
