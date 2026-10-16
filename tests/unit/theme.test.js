import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTheme } from '../../src/lib/theme.js';

describe('The theme an attendee sees', () => {
  test('a visitor with no stored choice sees dark, whatever the OS says', () => {
    assert.equal(resolveTheme(undefined, false), 'dark');
    assert.equal(resolveTheme(null, false), 'dark');
    assert.equal(resolveTheme(undefined, true), 'dark');
  });

  test('an unknown stored value falls back to dark', () => {
    assert.equal(resolveTheme('sepia', false), 'dark');
    assert.equal(resolveTheme('', false), 'dark');
  });

  test('light and dark are honoured regardless of the OS', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('dark', true), 'dark');
  });

  test('system follows the OS', () => {
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('system', true), 'dark');
  });
});

describe('The UI context doc', () => {
  test('no longer claims the app is dark only', () => {
    const doc = readFileSync(new URL('../../docs/context/ui.md', import.meta.url), 'utf8');
    assert.equal(doc.includes('Dark only'), false);
  });
});
