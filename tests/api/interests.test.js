import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/**
 * PUT /api/users/:id/interests replaces an attendee's interests, and holds the
 * write to the same rule as the seed: topic tags only, by name.
 */

let api;
let close;
let topics;
let others;
const USER = 3;

before(async () => {
  const started = await startApi();
  api = started.api;
  close = started.close;
  const { tags } = await api.json('/bootstrap');
  topics = tags.filter((t) => t.kind === 'topic').map((t) => t.name);
  others = tags.filter((t) => t.kind !== 'topic').map((t) => t.name);
});
after(() => close());

const interestsOf = async (id = USER) => (await api.json(`/users/${id}`)).interests;

describe('PUT /users/:id/interests', () => {
  test('a valid save returns the updated attendee and persists, in request order', async () => {
    const wanted = [topics[4], topics[1], topics[7]];
    const res = await api.put(`/users/${USER}/interests`, { interests: wanted });

    assert.equal(res.status, 200);
    assert.equal(res.body.id, USER);
    assert.deepEqual(res.body.interests, wanted);
    assert.deepEqual(await interestsOf(), wanted);
  });

  test('it replaces the whole set and leaves other attendees alone', async () => {
    const before = await interestsOf(1);
    await api.put(`/users/${USER}/interests`, { interests: [topics[0]] });
    assert.deepEqual(await interestsOf(), [topics[0]]);
    assert.deepEqual(await interestsOf(1), before);
  });

  test('duplicates are collapsed rather than rejected', async () => {
    const res = await api.put(`/users/${USER}/interests`, { interests: [topics[2], topics[3], topics[2]] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.interests, [topics[2], topics[3]]);
  });

  test('an unknown tag, a non-topic tag, or a bad body is a 400 that changes nothing', async () => {
    await api.put(`/users/${USER}/interests`, { interests: [topics[5]] });
    assert.ok(others.length > 0, 'the seed has non-topic tags');

    const bad = [
      { interests: ['Not A Tag'] },
      { interests: [others[0]] },
      { interests: [topics[5], 'Not A Tag'] },
      { interests: [42] },
      { interests: topics[5] },
      {},
    ];
    for (const body of bad) {
      const res = await api.put(`/users/${USER}/interests`, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.error);
    }
    assert.deepEqual(await interestsOf(), [topics[5]]);
  });

  test('an empty set clears the attendee\'s interests', async () => {
    await api.put(`/users/${USER}/interests`, { interests: [topics[0]] });
    const res = await api.put(`/users/${USER}/interests`, { interests: [] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.interests, []);
    assert.deepEqual(await interestsOf(), []);
  });

  test('an unknown attendee is a 404', async () => {
    const res = await api.put('/users/99999/interests', { interests: [] });
    assert.equal(res.status, 404);
  });
});
