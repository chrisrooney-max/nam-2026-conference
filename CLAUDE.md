# ORBIT '26 — conference companion app

A sample app for a workshop on using AI across the software delivery lifecycle.
Attendees fork this repo, turn requirements into GitHub Issues, and let an
engineering harness implement them. **Read this file before writing code here.**

## Run it

```bash
npm install
npm run dev      # seed, then API :3001 + web :5173
npm test         # unit + API, under a second — after every edit
npm run verify   # reseed + Playwright, desktop and mobile — before "done"
```

Every other command and flag: `docs/context/testing.md`.

## Stack

Node 22 · Express · better-sqlite3 · React 18 · Vite 6 · React Router 6 ·
Tailwind CSS v4 · Playwright. No state library, no ORM, no component library —
if you are reaching for one, you are probably solving the wrong problem.

## Start from the context docs

This file says what was decided and why; `docs/context/` says where it lives
and how it works — files, functions, payloads, test ids, the repo layout.
`node scripts/context.mjs index` lists one doc per area and when to read it;
`show <doc>` prints a doc's outline and `show <doc> Gotchas <part>` just those
parts — read by the piece, since whatever an agent reads it re-reads on every
turn after. They are read *instead of* the code, so a pull request that changes what a doc
describes updates it (`node scripts/context.mjs for <file…>` says which).

## Conventions

**The API boundary is camelCase.** Every snake_case → camelCase translation
happens in the `server/lib/query.js` mappers; a new column goes in its mapper —
React must never see `snake_case`.

**Components never call `fetch`.** A new endpoint is a route in the matching
`server/routes/*.js`, rows mapped with a `toX()` helper, and one function in
`src/lib/api.js`, which is the only caller of `fetch`.

## Area rules

UI and server conventions live in `.claude/rules/` and load when you open a file
in their area — `ui.md` for `src/`, `server.md` for `server/` — so an agent
working elsewhere does not carry them. **Reviewing a change?** Read the rule file
for each area the diff touches: reading a diff does not load them.

## There is exactly one action

Adding a session to your agenda **takes a seat**. There is no separate bookmark,
and there should not be one.

We originally copied AWS re:Invent and Google I/O, which split favouriting from
reserving. Both had to publish FAQ entries explaining the difference, and it
confused people here too. Most of the industry — Sched, EventMobi, and KubeCon
on top of Sched — uses a single action with capacity rules attached, so that is
what this app does.

- `reservations` is the only table. Adding moves `sessions.seats_taken` for
  *everybody*; a full room waitlists you instead; removing a confirmed seat
  promotes whoever has waited longest, and if they were holding a clashing seat
  as a backup, that seat is released and handed on the same way. All
  transactional — `server/lib/seats.js`.
- **Hours are hours you hold a chair for.** Anything counting booked time —
  `scheduleFor`'s `totalMinutes`, My Agenda's hours tile and day lines — counts
  confirmed seats only; queued time is totalled apart (`waitlistedMinutes`,
  `+Nh waitlisted`) rather than folded in or dropped. A waitlist place may never
  come good, so counting it as booked promises a fuller day than the room can give.
- The page is **My Agenda** (`/my-agenda`), which is what Whova, Cvent, EventMobi
  and AWS all call it. `/my-plan` redirects.
- The store (`useConference()`: `toggleSeat`, `reservationFor`, `onAgenda`) is
  the source of truth for your own reservation state — never fall back to the
  payload a page was fetched with, or "removed" stays unreachable until a refresh.

## The attendee chain

Four rules borrowed from real conferences; each writes state and gates the next:

1. **Add a session** → takes a seat, or a waitlist place. **You cannot hold two
   seats in overlapping slots** — the API returns 409 with the clashing session,
   and the UI offers a swap. Every real system blocks this rather than warning.
   The exception is a clash with a *full* talk: that queues you, and the seat you
   hold is kept as backup until a place opens, so click order never matters.
   Nor can you take a seat in a session that has already ended (also a 409).
   Nothing releases a seat you have checked in to or that is running: My Agenda
   is built from `reservations`, so the delete drops an attended talk and its
   rating prompt. Any new path that frees a seat (promotion, swap, cleanup) checks.
2. **Check in** → opens 15 minutes before the session starts, closes when it
   ends. You cannot check in to something that has not happened.
3. **Rate it** → only if you checked in, only once it is over. One rating per
   person, editable. Ratings roll up onto `sessions.avg_rating` immediately.
4. **Export** → `/api/users/:id/agenda.ics` and `/api/sessions/:id.ics`.

A clash is a **choice, not an error**: the 409 carries both sessions and the UI
opens `<ConflictDialog>` side by side with Keep / Swap. Do not demote that to a
toast — a toast disappears while the decision is still open.

The rules run in transactions in `seats.js` and `attendance.js`, taking the
clock from the *client*, because conference time is simulated. (how:
`docs/context/seats.md`, `attendance.md`)

### Writing tests against this

That state is real, and Playwright tests all run concurrently. Give each
**test, per project,** its own attendee and day (a data lane), release what you
book, and never reuse an attended session — a check-in cannot be undone. (how:
`docs/context/testing.md`)

## The conference clock

**Day 1 is the day you seed** (`ORBIT_START_DATE` overrides it), and its
morning, to 12:15, has already been attended — the only seeded check-ins and
ratings. Tests ask the API for the dates (`conferenceDays()`), never hard-code them.

"Now" is simulated: the viewer's real time of day projected onto Day 1, ticking
every 30 seconds, clamped to a lively mid-morning outside 08:00–22:30. Read it
from `useConference().clock` (`{ day, time }`) — never `new Date()` in a
component. Pin it with `?at=YYYY-MM-DDTHH:MM`; a value without the time part is
ignored. **Any test that touches live state must pin the clock**, otherwise it
passes or fails depending on the hour it runs. (how: `docs/context/clock.md`)

## Nothing may claim to be true when it is not

The seed generates a *live* conference, so anything that implies elapsed time
has to be earned:

- **Ratings and reviews only exist for sessions that have already finished.**
  Seeding a 4.5 onto a talk three days away was the clearest possible tell that
  the data was fake, and it poisoned the "highest rated" ranking. The seed only
  rates Day 1 morning sessions, and only from attendees it checked in, by the
  same rules as the API; `speakers.avg_rating` is derived from those session
  ratings, never invented.
- **Never hard-code a date, month or weekday.** Day 1 moves with the seed, so
  the footer, announcements and body copy all derive from `conference.dates`
  and `days[n]`. A footer reading "Oct 12–15" under a September hero is the
  fastest way to lose an attendee's trust.
- **No invented external links.** Speaker socials show the handle but do not
  link, and sponsor websites are not shown, because the domains do not exist.

## Verifying a change

Three layers, fastest first: `npm test`, `npm run verify` (the gate for
"done"), `npm run shot` if visual. **If a rule can be proven without a browser,
prove it without one** — an agent can afford `npm test` after every edit, not
Playwright. Pure functions → unit; rules needing the database → API; what the
attendee sees → spec. (how: `docs/context/testing.md`)

**Claim a lane before you run anything** in a worktree
(`eval "$(node scripts/lane.mjs claim 42)"`). Without one, Playwright reuses any
app on the web port — another worktree's — and your specs pass against the
*other* branch's code. CI runs the same commands.

## Where work is tracked

**Tickets are GitHub Issues** — of the fork you are working in, never the upstream's.
In this checkout that is `EqualExperts/nam-2026-conference`, the repository `origin`
points at; `upstream` is the repo the fork came from and is never where work goes.

Reach it with the authenticated `gh` CLI (`gh issue list`, `gh issue view 42`). A
GitHub MCP server or the REST API with a token reach the same issues; none is
preferred, so use whichever is available. To confirm access, probe read-only —
list or read an existing issue — and never create a test ticket to find out.

Labels and workflow conventions live in `docs/harness/github.md` and
`docs/context/harness.md`; they are not repeated here.

## Data model

Four days from the day you seed, ~140 sessions, 110 speakers, **two venues 6.2
miles apart**, no authentication. Schema: `docs/DATA_MODEL.md`; the seeded
attendees: `docs/context/seed.md`.

## Setting this up on a fork

Actions → **Set up the harness** → Run workflow. A fork inherits the workflows
but not the labels, and `ready-for-ai` is what starts everything. Keys, tokens
and triggers: `docs/harness/github.md`.

## What happens to a ticket

1. **Ship** — `ready-for-ai` (or `@claude` on an issue) runs `/ship`, where
   every phase is a fresh agent. Setup sizes the ticket: most are **small**
   (one auditor per stage, two rounds, Sonnet); `ship:full` gets the whole
   loop on Opus. No pull request until the gate is green and no
   auditor blocker survives a skeptic; one that will not converge goes to a
   person as a **draft**.
2. **Code review**, 3. **QA** — on the opened, non-draft pull request, each with
   a **confidence** meaning coverage, not feeling; a low one reads *unproven*.
4. **A human merges.** Nothing is a required check.

(how: `docs/context/harness.md`, `docs/harness/ship-playbook.md`)

## Every change starts with a spec

`specs/<issue>-<slug>.md`, written before the code and pushed as the first
commit on the branch. A reviewer reads the intent before the diff, and a
misreading of the ticket surfaces while it is still cheap.

They are kept: `specs/` records how the code got this way — what each change
was for, what the ticket left open, and what was deliberately left undone.

## Commits

**Conventional Commits.** `type(scope): subject` — the subject in the
imperative, lower case, no full stop, under about 70 characters.

```
fix(seats): release a waitlist place when the seat ahead is dropped
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`. The scope is optional and names the area, not the file.

The subject says what changed; **the body says why.** A diff already shows
what you did, so a body that restates it earns nothing — the reason, the
alternative you rejected, and the thing that will look wrong to whoever reads
this in six months are what is worth writing down. Skip the body when the
subject genuinely covers it.

## House rules

- Good engineering, no over-engineering. Match the surrounding code.
- Prefer editing an existing file over adding a new abstraction layer.
- Keep `seed.js` deterministic — it seeds its own PRNG so everyone's database is
  identical apart from the dates. Never use `Math.random()` there.
- Do not commit `data/orbit.db`, `.screenshots/`, or Playwright artefacts.
- Do not introduce a state management library, an ORM, or a UI kit.
