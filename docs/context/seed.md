---
area: seed
summary: How the fake conference is generated — venues, rooms, speakers, the four-day programme, attendee plans, full rooms and queues, and the Day 1 morning that has already happened.
read_when: changing server/seed.js, adding a column that needs seed data, a test that depends on seeded state, replacing a portrait, ORBIT_START_DATE, the seeded attendees
files:
  - server/seed.js
  - server/avatar-presentation.json
  - scripts/fetch-avatars.mjs
  - public/avatars/
tests:
  - tests/api/seed.test.js
  - tests/smoke.spec.js
  - tests/seats.spec.js
related: [architecture, testing, seats, attendance, schedule, speakers, venues]
---

# Seed

## How it works

`server/seed.js` is one top-to-bottom script (no exports). It runs `dropAll()` then
`migrate()` from `server/db.js` against `DB_PATH` (so `ORBIT_DB=… node server/seed.js`
seeds any file — `tests/api/harness.js:startApi` relies on this). Every section inserts
with a prepared statement, then reads the rows back with `SELECT *` so later sections
use real ids.

**PRNG.** `let SEED = 20261012` and `rnd()` is an LCG; `pick`, `pickN`, `int`, `flt`,
`chance` and the Fisher-Yates `shuffle` all draw from it. Output depends only on the order
of `rnd()` calls, so **inserting a new random draw anywhere shifts everything after it**
— every attendee plan, which sessions are full, the promotion fixture. Add new random
data at the end of the script, or draw from a separate generator.

**Generation order** (each step's output feeds the next):

1. Venues `AURORA` and `FOUNDRY` (real lat/lng), then `venue_travel` for four modes each way.
2. Rooms: `AURORA_ROOMS` (19) and `FOUNDRY_ROOMS` (10) as literal tuples. The Cooling Tower
   and the Boiler Room are `accessible = 0`.
3. `TRACKS` (10, slug from name) and `TAGS` by kind: `topic`, `tech`, `audience`, `vibe`.
4. Speakers. Ids 1–2 are the hand-written `SPEAKING_ATTENDEES` (Andy Vays, Abraham
   Marín Pérez, both `featured`). Ids 3–110 come from a 108-iteration loop: the portrait's
   presentation (`avatar-presentation.json` › `presentation[id]`) picks `FIRST_M` or
   `FIRST_F` and the pronouns; the first ten generated (ids 3–12) are `featured`.
   `avg_rating` starts at 0. Then any `public/avatars/speaker-NNN.jpg` present becomes
   `image_url = /avatars/speaker-NNN.jpg`.
5. Sessions, per day in `DAYS`: an 08:00–08:45 keynote in Nebula Main Stage (Day 3: The
   Blast Furnace), its speakers replaced by 1–2 `featured` speakers. Then `todaysRooms` =
   4 random Aurora rooms + 1 Foundry room from `bookable` (not Social, not the main stage),
   each given one random track (`roomTrack`). Each of the seven `SLOTS` (09:00 … 17:15)
   fills each of those rooms with 88% probability. Format follows `room.kind`; capacity is
   the room's; `seats_taken` is 22–104% of it, capped. `addSession` deals speakers from a
   weighted pool (`buildSpeakerPool`: everyone once, featured 3–5 extra) and 4–10 tags.
   Then four social events (Desert Terrace, The Smelter). About 140 sessions in total.
6. `assignSpeaker` puts Andy on Day 2 10:15, Day 2 16:00 (Moderator), Day 4 11:30, and
   Abraham on Day 1 14:45 and Day 3 09:00 — the biggest non-keynote session in that slot
   (or, with a pick's `track`, the biggest on that track; Abraham's Day 3 talk asks for AI
   Product & Strategy), replacing its speakers. Each pick also carries a hand-written `talk`
   that overwrites the session's title, subtitle, abstract, takeaways, prerequisites and
   all its tags, so the hosts' sessions are their real subjects; format, room, track and
   seats stay as generated. Speakers left with nothing are then paired onto solo sessions.
7. `USERS` — six attendees (below). Ticket tier `Speaker` sets `speaker_id` by name and
   reuses the speaker portrait; the others get `attendee-00N.jpg`.
8. Plans. Jonas's cross-town pairs are booked first (Day 1 Aurora 10:15 → Foundry 11:30;
   Day 4 Aurora 09:00 → Foundry 10:15). Then `PLAN_SHAPE[i]` gives each attendee days
   attended, talks per day and keynote probability; `bookSeat` takes a seat or waitlists,
   and only one per slot.
9. Full rooms: the top ~12% of `popular` (workshops, then rooms under 250) get
   `seats_taken = capacity`; eight more sit 1–4 below. `promotionFixture` is the first full
   session Jonas can hold a confirmed seat on with nobody else confirmed and no clash for
   anyone; he is given that seat, then 1–3 attendees queue on it and on five other full ones.
10. Follows: 2–5 per attendee, mostly speakers they booked plus headliners.
11. Day 1 morning: every confirmed seat on `DAYS[0]` ending by `MORNING_ENDS = '12:15'`
    gets a check-in at its start time; ~70% of those also get a rating (2–5 stars, optional
    comment). Then `sessions.avg_rating/rating_count` and `speakers.avg_rating` are
    recomputed from `ratings`. Nothing outside Day 1 morning is checked in or rated.
12. Vendors, sponsors (website `https://<slug>.example.com` — stored, never rendered), and
    `ANN` announcements, whose dates and weekdays come from `DAYS` via `weekdayOf`.

**Dates.** `START_DATE = ORBIT_START_DATE ?? isoDay(new Date())` — local calendar date, not
UTC. `DAYS` is four consecutive dates from it. `ORBIT_START_DATE=2026-11-03 npm run db:seed`
pins it. Only dates change between machines; the PRNG output does not.

**Seeded attendees** (`tests/helpers.js:ATTENDEES` mirrors these ids):

| id | name | tier | notes |
| --- | --- | --- | --- |
| 1 | Jonas Claesson | VIP | all 4 days, cross-town traps, holds the promotion fixture seat |
| 2 | Andy Vays | Speaker | `speaker_id` 1, presents 3 sessions, 3 days |
| 3 | Kenji Nakamura | Standard | 2 days, always the keynote |
| 4 | Sofia Almeida | VIP | 4 days, the biggest plan |
| 5 | Marcus Whitfield | Standard | 2 days, the smallest plan |
| 6 | Abraham Marín Pérez | Speaker | `speaker_id` 2, presents 2 sessions, 3 days |

## Invariants

- Never `Math.random()` or `Date.now()`-dependent values other than `START_DATE`.
- `sessions.recording_url/slides_url/repo_url` are always null; ratings are always 0 at insert.
- Seeded seats obey the API's rules: one seat per slot per attendee, nobody queues while
  seats are free, nobody queues in a slot they hold a seat in.
- The grid needs each day's five rooms to run all day — keep `todaysRooms` fixed per day.
- **An attendee's `interests` are topic tags** (`TAGS.topic`), never a tech,
  audience or vibe tag: what an attendee chooses from is the topic list, and a
  stored value it cannot show is one a save drops. Kenji's `Edge` (a tech tag)
  did exactly that on #219. `tests/api/seed.test.js` holds every attendee to it, and
  `PUT /api/users/:id/interests` (seats doc) rejects anything else with a 400.

## Gotchas

- Presentation keys are **speaker ids as strings**; the loop reads `PRESENTATION[String(i + 3)]`.
  A missing key falls back to `chance(0.5)`, which consumes an extra `rnd()` and reshuffles
  everything after it.
- Portraits (why they are synthetic: `.claude/rules/ui.md` § Imagery) were fetched once by
  `npm run avatars` (`scripts/fetch-avatars.mjs`, missing files only), downscaled to 256px
  and committed, so the app never touches the network at runtime; they are served from
  `/avatars/…` via `speakers.image_url` / `users.image_url`. A speaker with no file falls
  back to `GeneratedAvatar`, so a partial set is never a broken image. The source dataset
  also contains children — eyeball any replacement before committing it. The exceptions are
  `speaker-001.jpg` (Andy Vays), `speaker-002.jpg` (Abraham Marín Pérez) and `attendee-001.jpg` (Jonas Claesson): real colleagues who agreed to appear, and `fetch-avatars.mjs`
  skips the speaker ones (`REAL`), even with `--force`.
- `fetch-avatars.mjs` only fetches `speaker-NNN.jpg` (default count 180, though only 110
  speakers exist) and never `attendee-*.jpg`. It is strictly sequential with a 900 ms gap
  and rejects duplicates by SHA-1 (the source serves whatever it generated most recently,
  so concurrent requests come back identical — do not parallelise it); resizing uses macOS `sips` and keeps the full-size file
  elsewhere. `--force` re-downloads everything — which invalidates every presentation entry.
- `sessions.seats_taken` is a seeded crowd size, not a count of `reservations` rows — the
  six attendees are a tiny share of it, and step 9 overwrites it outright. Never assert
  `seats_taken == COUNT(reservations)`.
- Seeded bookings by day: Kenji and Marcus only have Days 1–2, Andy and Abraham Days 1–3,
  Jonas and Sofia all four. Several Playwright tests depend on that shape
  (`findPromotionFixture` in `tests/seats.spec.js`, the `clean` lanes). Changing plans or `PLAN_SHAPE` can break them;
  see testing.

## Where to change…

- New column with data: add it to the table's insert statement here, to `SCHEMA` in
  `server/db.js`, and to the mapper in `server/lib/query.js`.
- A replaced portrait: the file in `public/avatars/` plus its entry in `avatar-presentation.json`.
- More or different attendees: `USERS` and `PLAN_SHAPE` (same index), then `ATTENDEES` in `tests/helpers.js`.
