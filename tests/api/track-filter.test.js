import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/**
 * The schedule's track filter takes several tracks at once: `trackSlug=a,b`.
 * A track list matches a session in any of them, and one slug is the query it
 * always was.
 */

let api;
let close;
let slugs;

before(async () => {
  ({ api, close } = await startApi());
  const { tracks } = await api.json('/bootstrap');
  slugs = tracks.map((t) => t.slug);
});
after(() => close());

const ids = (list) => list.map((s) => s.id).sort();
const forTracks = (list) => api.json(`/sessions?trackSlug=${list.join(',')}`);

describe('trackSlug with several tracks', () => {
  test('two tracks return the union of each track on its own', async () => {
    const [a, b] = slugs;
    const [onlyA, onlyB, both] = await Promise.all([forTracks([a]), forTracks([b]), forTracks([a, b])]);
    assert.ok(onlyA.length > 0 && onlyB.length > 0, 'the seed gives both tracks sessions');
    assert.deepEqual(ids(both), ids([...onlyA, ...onlyB]));
    assert.ok(both.length < (await api.json('/sessions')).length, 'a third track is left out');
  });

  test('every session returned belongs to one of the chosen tracks', async () => {
    const [a, b] = slugs;
    const both = await forTracks([a, b]);
    assert.ok(both.length > 0);
    for (const s of both) assert.ok([a, b].includes(s.track.slug), `session ${s.id} is in ${s.track.slug}`);
  });

  test('adding a track grows the list and removing it shrinks it back', async () => {
    const [a, b, c] = slugs;
    const counts = [];
    for (const list of [[a], [a, b], [a, b, c], [b, c], [b]]) counts.push((await forTracks(list)).length);
    const alone = await Promise.all(slugs.slice(0, 3).map((s) => forTracks([s])));
    assert.deepEqual(counts, [
      alone[0].length,
      alone[0].length + alone[1].length,
      alone[0].length + alone[1].length + alone[2].length,
      alone[1].length + alone[2].length,
      alone[1].length,
    ]);
  });

  test('one track is the same list as before, and the order of the list does not matter', async () => {
    const [a, b] = slugs;
    const single = await forTracks([a]);
    assert.ok(single.length > 0);
    assert.ok(single.every((s) => s.track.slug === a), 'a single slug still matches by slug');
    assert.deepEqual(ids(await forTracks([b, a])), ids(await forTracks([a, b])));
  });

  test('an unknown slug in the list matches nothing, and empty segments are ignored', async () => {
    const [a, b] = slugs;
    const onlyA = await forTracks([a]);
    assert.deepEqual(ids(await forTracks([a, 'no-such-track'])), ids(onlyA));
    assert.deepEqual(await forTracks(['no-such-track']), []);
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=${a},,${b},`)), ids(await forTracks([a, b])));
    assert.deepEqual(ids(await api.json(`/sessions?trackSlug=${a}, ${b}`)), ids(await forTracks([a, b])));
  });

  test('a track list combines with the other filters', async () => {
    const [a, b] = slugs;
    const { days } = await api.json('/bootstrap');
    const day = days[1].date;
    const [dayAll, dayBoth] = await Promise.all([
      api.json(`/sessions?day=${day}`),
      api.json(`/sessions?day=${day}&trackSlug=${a},${b}`),
    ]);
    const [dayA, dayB] = await Promise.all([a, b].map((s) => api.json(`/sessions?day=${day}&trackSlug=${s}`)));
    assert.ok(dayBoth.length <= dayAll.length);
    assert.deepEqual(ids(dayBoth), ids([...dayA, ...dayB]));
  });
});
