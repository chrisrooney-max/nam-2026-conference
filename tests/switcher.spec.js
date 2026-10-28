import { test, expect } from '@playwright/test';
import { visit, momentOn, laneFor, bookableFor, shotForPR, ATTENDEES, API } from './helpers.js';

test.describe('Attendee switcher', () => {
  test('the switcher counts what is on an agenda, not what was "saved"', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.sofia });
    await page.getByRole('button', { name: /Switch attendee/ }).click();

    const option = page.getByRole('option', { name: /Sofia/ });
    await expect(option).toContainText(/[1-9]\d* on agenda/);
    await expect(option).not.toContainText(/saved/i);
  });

  test('the switcher\'s own row updates after booking or releasing a seat, without a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('switcher.live-count', testInfo);
    const target = (await bookableFor(request, lane.user, lane.day)).find((s) => s.seatsLeft > 3);
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

  test('choosing an attendee in the switcher signs in as them', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.jonas });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByRole('option', { name: /Andy Vays/ }).click();

    await expect(page.getByRole('button', { name: /Viewing as Andy Vays/ })).toBeVisible();
    // the menu now offers what only a speaker gets
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(page.getByTestId('own-speaker-profile')).toBeVisible();
  });

  test('the switcher offers only the three hosts, plus whoever is already selected', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.jonas });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(page.getByRole('option')).toHaveText([/Jonas Claesson/, /Andy Vays/, /Abraham Marín Pérez/]);
    await page.keyboard.press('Escape');

    // Another seeded attendee, selected through localStorage as the tests do,
    // stays listed and selected so it can be switched away from.
    await visit(page, '/', { as: ATTENDEES.kenji });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(page.getByRole('option')).toHaveText([/Jonas Claesson/, /Andy Vays/, /Kenji Nakamura/, /Abraham Marín Pérez/]);
    await expect(page.getByRole('option', { selected: true })).toContainText('Kenji Nakamura');
  });

});

test.describe('Interests', () => {
  test('an attendee sets their interests from the menu, and they survive a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('switcher.interests', testInfo);
    const { tags } = await (await request.get(`${API}/bootstrap`)).json();
    const topics = tags.filter((t) => t.kind === 'topic');
    const slugOf = (name) => topics.find((t) => t.name === name).slug;
    const original = (await (await request.get(`${API}/users/${lane.user}`)).json()).interests;

    const dialog = page.getByRole('dialog', { name: 'Your interests' });
    const open = async () => {
      await page.getByRole('button', { name: /Switch attendee/ }).click();
      await page.getByTestId('edit-interests').click();
      await expect(dialog).toBeVisible();
    };
    const pressed = async () => (await dialog
      .locator('[aria-pressed="true"]')
      .evaluateAll((els) => els.map((e) => e.dataset.testid.replace('interest-', '')))).sort();

    try {
      await visit(page, '/', { as: lane.user, at: await momentOn(0, '07:00') });

      // the action is a link in the menu's header, not a button of its own
      await page.getByRole('button', { name: /Switch attendee/ }).click();
      await expect(page.getByTestId('open-interests')).toHaveCount(0);
      await expect(page.getByTestId('edit-interests')).toBeVisible();
      await expect(page.getByRole('option', { selected: true })).toBeVisible();
      await page.keyboard.press('Escape');

      // the dialog lists topic tags only, with the current interests on
      await open();
      await expect(dialog.locator('[data-testid^="interest-"]')).toHaveCount(topics.length);
      expect(await pressed()).toEqual(original.map(slugOf).sort());
      await shotForPR(page, 'The interests dialog with the attendee\'s current topics selected');

      // closing without saving, three ways
      await dialog.getByTestId(`interest-${topics.find((t) => !original.includes(t.name)).slug}`).click();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await open(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
      await open(); await dialog.getByRole('button', { name: 'Close' }).click({ position: { x: 8, y: 8 } });
      await expect(dialog).toBeHidden();
      await open();
      expect(await pressed()).toEqual(original.map(slugOf).sort());

      // turn one off (when there is one) and one on, then save
      const off = original[0];
      const on = topics.find((t) => !original.includes(t.name));
      if (off) await dialog.getByTestId(`interest-${slugOf(off)}`).click();
      await dialog.getByTestId(`interest-${on.slug}`).click();
      const wanted = [...original.filter((n) => n !== off).map(slugOf), on.slug].sort();
      expect(await pressed()).toEqual(wanted);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();

      // reopening shows it, and so does a reload
      await open();
      expect(await pressed()).toEqual(wanted);
      await page.keyboard.press('Escape');
      await page.reload();
      await open();
      expect(await pressed()).toEqual(wanted);
      await page.keyboard.press('Escape');

      // an empty selection saves too
      await open();
      for (const slug of wanted) await dialog.getByTestId(`interest-${slug}`).click();
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();

      // with nothing stored the profile prompts instead; skipping it opens the menu
      await page.getByRole('button', { name: /Switch attendee/ }).click();
      await expect(dialog).toBeVisible();
      expect(await pressed()).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox', { name: 'Attendees' })).toBeVisible();

      // switching attendee still works, from the menu the skipped prompt opened
      await page.getByRole('option', { name: /Andy Vays/ }).click();
      await expect(page.getByRole('button', { name: /Viewing as Andy Vays/ })).toBeVisible();
    } finally {
      await request.put(`${API}/users/${lane.user}/interests`, { data: { interests: original } });
    }
  });

  test('an attendee with no interests is prompted whenever the profile opens, until they save one', async ({ page, request }, testInfo) => {
    const lane = await laneFor('switcher.interests-prompt', testInfo);
    const { tags } = await (await request.get(`${API}/bootstrap`)).json();
    const topic = tags.find((t) => t.kind === 'topic');
    const original = (await (await request.get(`${API}/users/${lane.user}`)).json()).interests;
    const put = (interests) => request.put(`${API}/users/${lane.user}/interests`, { data: { interests } });

    const dialog = page.getByRole('dialog', { name: 'Your interests' });
    const menu = page.getByRole('listbox', { name: 'Attendees' });
    const profile = page.getByRole('button', { name: /Switch attendee/ });

    try {
      await put([]);
      await visit(page, '/', { as: lane.user, at: await momentOn(0, '07:00') });

      // the first open is the prompt; Cancel skips it into the menu
      await profile.click();
      await expect(dialog).toBeVisible();
      await expect(menu).toBeHidden();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(menu).toBeVisible();

      // skipping changed nothing: the next open, and one after a reload, prompt again
      await page.keyboard.press('Escape');
      await profile.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeVisible();
      await page.reload();
      await profile.click();
      await expect(dialog).toBeVisible();
      await shotForPR(page, 'The interests prompt, shown when an attendee with no interests opens their profile');

      // saving nothing keeps the prompt coming
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();
      await profile.click();
      await expect(dialog).toBeVisible();

      // one topic ends it: the menu opens directly, also after a reload
      await dialog.getByTestId(`interest-${topic.slug}`).click();
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();
      await profile.click();
      await expect(menu).toBeVisible();
      await expect(dialog).toBeHidden();
      await page.keyboard.press('Escape');
      await page.reload();
      await profile.click();
      await expect(menu).toBeVisible();
      await expect(dialog).toBeHidden();

      // the link in the menu edits them pre-filled, and closing it does not prompt
      await page.getByTestId('edit-interests').click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect(dialog.getByTestId(`interest-${topic.slug}`)).toHaveAttribute('aria-pressed', 'true');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(menu).toBeHidden();

      // switching attendee still works
      await profile.click();
      await page.getByRole('option', { name: /Andy Vays/ }).click();
      await expect(page.getByRole('button', { name: /Viewing as Andy Vays/ })).toBeVisible();
    } finally {
      await put(original);
    }
  });
});

test.describe('Your speaker profile', () => {
  test('a speaking attendee is linked to their own profile, which says it is them', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.andy });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByTestId('own-speaker-profile').click();

    await expect(page.getByTestId('speaker-name')).toHaveText('Andy Vays');
    await expect(page.getByTestId('speaker-is-you')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Speaking/ })).toBeVisible();
  });

  test('nobody else is told a profile is theirs', async ({ page }) => {
    // Abraham is a speaker too, but this is not his profile.
    await visit(page, '/', { as: ATTENDEES.abraham });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await page.getByTestId('own-speaker-profile').click();
    await expect(page.getByTestId('speaker-is-you')).toBeVisible();
    const own = page.url();

    await visit(page, '/', { as: ATTENDEES.andy });
    await page.goto(own);
    await expect(page.getByTestId('speaker-name')).toHaveText(/Abraham/);
    await expect(page.getByTestId('speaker-is-you')).toHaveCount(0);

    await visit(page, '/', { as: ATTENDEES.kenji });
    await page.getByRole('button', { name: /Switch attendee/ }).click();
    await expect(page.getByTestId('own-speaker-profile')).toHaveCount(0);
  });
});
