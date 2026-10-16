import { test, expect } from '@playwright/test';
import { visit, failOnPageErrors, shotForPR } from './helpers.js';

/**
 * Light / Dark / System. The theme is pinned through visit() and the OS scheme
 * through emulateMedia, so nothing here depends on the machine running it.
 */

const html = (page) => page.locator('html');
const choose = (page, name) => page.getByRole('group', { name: 'Theme' }).getByRole('button', { name });
const stored = (page) => page.evaluate(() => window.localStorage.getItem('orbit:theme'));

test('the header offers Light, Dark and System under an accessible name', async ({ page }) => {
  await visit(page);
  const group = page.getByRole('group', { name: 'Theme' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('button')).toHaveCount(3);
  for (const name of ['Light', 'Dark', 'System']) {
    await expect(group.getByRole('button', { name })).toBeVisible();
  }
});

test('a first-time visitor sees dark even when the OS prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await visit(page, '/', { theme: null });
  expect(await stored(page)).toBeNull();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(choose(page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
});

test('visit() pins dark by default, whatever the OS prefers', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await visit(page);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await stored(page)).toBe('dark');
});

test('visit() can pin light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await visit(page, '/', { theme: 'light' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(choose(page, 'Light')).toHaveAttribute('aria-pressed', 'true');
});

test('System follows the OS and switches live, without a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await visit(page);
  await choose(page, 'System').click();
  await expect(choose(page, 'System')).toHaveAttribute('aria-pressed', 'true');
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');

  const navigations = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(navigations).toEqual([]);
});

test('a fixed choice ignores the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await visit(page);
  await choose(page, 'Light').click();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
});

test('the choice survives a reload', async ({ page }) => {
  await visit(page);
  await choose(page, 'Light').click();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(choose(page, 'Light')).toHaveAttribute('aria-pressed', 'true');
  expect(await stored(page)).toBe('light');
});

test('light is legible: pale ground, dark ink, and a header that is not the dark glass', async ({ page }) => {
  const errors = failOnPageErrors(page);
  const colours = async () => page.evaluate(() => ({
    ground: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.body).color,
    header: getComputedStyle(document.querySelector('header')).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  const channels = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luma = (rgb) => { const [r, g, b] = channels(rgb); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

  await visit(page, '/', { theme: 'dark' });
  const dark = await colours();
  expect(luma(dark.ground)).toBeLessThan(0.2);
  expect(luma(dark.ink)).toBeGreaterThan(0.8);

  await choose(page, 'Light').click();
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  const light = await colours();
  expect(luma(light.ground)).toBeGreaterThan(0.8);
  expect(luma(light.ink)).toBeLessThan(0.3);
  expect(light.header).not.toBe(dark.header);
  expect(luma(light.header)).toBeGreaterThan(0.7);
  expect(light.scheme).toBe('light');
  await shotForPR(page, 'Home in the light theme, with the Light Dark System control in the header');
  expect(errors).toEqual([]);
});

test('every top-level page renders in light without errors', async ({ page }) => {
  const errors = failOnPageErrors(page);
  for (const path of ['/', '/schedule', '/speakers', '/my-agenda', '/venues', '/food', '/expo']) {
    await visit(page, path, { theme: 'light' });
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('contentinfo')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('badges on a food cover keep pale text on a dark pill in light', async ({ page }) => {
  // The cover is a bright gradient in both themes, so a badge on it cannot use
  // the themed accent text, which turns dark in light.
  await visit(page, '/food', { theme: 'light' });
  const badge = page.getByText('Top rated').first();
  await expect(badge).toBeVisible();
  // Computed colour may come back as oklch(), so let a canvas turn it into RGB.
  const [r, g, b] = await badge.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
  expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toBeGreaterThan(0.8);
});
