import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/** `trackSlug` takes one slug or a comma-separated list: a session matches any of them. */

let api;
let close;
let all;
let slugs;

before(async () => {
  ({ api, close } = await startApi());
  all = await api.json('/sessions');
  slugs = [...new Set(all.map((s) => s.track.slug))];
});
after(() => close());

const ids = (list) => list.map((s) => s.id).sort((a, b) => a - b);
const inTracks = (...wanted) => all.filter((s) => wanted.includes(s.track.slug));

describe('GET /sessions?trackSlug=a,b', () => {
  test('the seed has at least three tracks with sessions', () => {
    assert.ok(slugs.length >= 3);
  });

  test('two tracks return exactly the union of their sessions', async () => {
    const [a, b] = slugs;
    const got = await api.json(`/sessions?trackSlug=${a},${b}`);
    assert.deepEqual(ids(got), ids(inTracks(a, b)));
    assert.ok(got.some((s) => s.track.slug === a) && got.some((s) => s.track.slug === b));
    assert.ok(got.every((s) => [a, b].includes(s.track.slug)));
  });

  test('adding a third track grows the result, removing one shrinks it', async () => {
    const [a, b, c] = slugs;
    const two = await api.json(`/sessions?trackSlug=${a},${b}`);
    const three = await api.json(`/sessions?trackSlug=${a},${b},${c}`);
    const back = await api.json(`/sessions?trackSlug=${b},${c}`);
    assert.equal(three.length, inTracks(a, b, c).length);
    assert.ok(three.length > two.length);
    assert.deepEqual(ids(back), ids(inTracks(b, c)));
    assert.ok(back.length < three.length);
  });

  test('a single track is the same as today', async () => {
    const [a] = slugs;
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=${a}`)), ids(inTracks(a)));
  });

  test('the list composes with the other filters', async () => {
    const [a, b] = slugs;
    const day = all[0].day;
    const got = await api.json(`/sessions?trackSlug=${a},${b}&day=${day}`);
    assert.deepEqual(ids(got), ids(inTracks(a, b).filter((s) => s.day === day)));
  });

  test('empty entries are ignored and an unknown slug matches nothing', async () => {
    const [a, b] = slugs;
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=,${a},,`)), ids(inTracks(a)));
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=${a},nope`)), ids(inTracks(a)));
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=nope,${b}`)), ids(inTracks(b)));
    assert.deepEqual(await api.json('/sessions?trackSlug=nope'), []);
  });
});
