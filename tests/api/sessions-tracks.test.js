import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/**
 * `trackSlug` on GET /api/sessions takes one slug or several, comma-separated
 * (`?track=a,b` on the schedule page). One slug must stay the query it always
 * was; several are a union.
 */

let api;
let close;
let slugs;

const slugsOf = (list) => [...new Set(list.map((s) => s.track.slug))].sort();
const ids = (list) => list.map((s) => s.id).sort((a, b) => a - b);

before(async () => {
  const started = await startApi();
  api = started.api;
  close = started.close;
  slugs = (await api.json('/bootstrap')).tracks.map((t) => t.slug);
});
after(() => close());

describe('GET /sessions?trackSlug=a,b', () => {
  test('returns only sessions of the named tracks, all of them', async () => {
    const [a, b] = slugs;
    const [onlyA, onlyB, both] = await Promise.all(
      [a, b, `${a},${b}`].map((t) => api.json(`/sessions?trackSlug=${t}`)),
    );
    assert.ok(onlyA.length > 0 && onlyB.length > 0, 'the seed gives every track sessions');
    assert.deepEqual(slugsOf(both), [a, b].sort());
    assert.equal(both.length, onlyA.length + onlyB.length);
    assert.deepEqual(ids(both), ids([...onlyA, ...onlyB]));
  });

  test('adding a track grows the result and removing it shrinks it back', async () => {
    const [a, b, c] = slugs;
    const counts = [];
    for (const t of [a, `${a},${b}`, `${a},${b},${c}`, `${b},${c}`, b]) {
      counts.push((await api.json(`/sessions?trackSlug=${t}`)).length);
    }
    const one = (t) => api.json(`/sessions?trackSlug=${t}`).then((l) => l.length);
    const [na, nb, nc] = await Promise.all([one(a), one(b), one(c)]);
    assert.deepEqual(counts, [na, na + nb, na + nb + nc, nb + nc, nb]);
  });

  test('combines with the other filters', async () => {
    const [a, b] = slugs;
    const day = (await api.json('/bootstrap')).days[0].date;
    const both = await api.json(`/sessions?day=${day}&trackSlug=${a},${b}`);
    assert.ok(both.every((s) => s.day === day && [a, b].includes(s.track.slug)));
  });

  test('tolerates spaces, empty entries and unknown slugs', async () => {
    const [a, b] = slugs;
    const clean = await api.json(`/sessions?trackSlug=${a},${b}`);
    const messy = await api.json(`/sessions?trackSlug=${encodeURIComponent(` ${a} ,, ${b},`)}`);
    assert.deepEqual(ids(messy), ids(clean));
    const withUnknown = await api.json(`/sessions?trackSlug=${a},no-such-track`);
    assert.deepEqual(ids(withUnknown), ids(await api.json(`/sessions?trackSlug=${a}`)));
    assert.deepEqual(await api.json('/sessions?trackSlug=no-such-track,also-not'), []);
    // nothing but separators names no track, so it filters nothing
    assert.equal((await api.json('/sessions?trackSlug=,')).length, (await api.json('/sessions')).length);
  });

  test('a single track and no track behave as before', async () => {
    const all = await api.json('/sessions');
    const [a] = slugs;
    const one = await api.json(`/sessions?trackSlug=${a}`);
    assert.deepEqual(slugsOf(one), [a]);
    assert.ok(one.length < all.length);
    assert.equal((await api.json('/sessions?trackSlug=')).length, all.length);
  });
});
