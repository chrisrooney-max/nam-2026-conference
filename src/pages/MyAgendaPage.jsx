import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { dayLabel, plural, time, timeRange } from '../lib/format.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { NextUpCard } from '../components/NextUpCard.jsx';
import { Avatar, Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton, Stat, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { hasEnded } from '../lib/clock.js';

/**
 * Shown only for attendees whose account is linked to a speaker profile.
 * Their own sessions come first — that is what they are here for.
 */
function SpeakingPanel({ user }) {
  const { data, loading } = useFetch(() => api.getUser(user.id), [user.id]);
  if (loading) return <Skeleton className="h-48" />;
  if (!data?.isSpeaker || !data.speakingSessions?.length) return null;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-violet-500/[0.06] p-6 sm:p-8"
      data-testid="speaking-panel"
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-400 to-cyan-400" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={data.speaker.name} initials={data.speaker.initials} accent={data.speaker.accent}
            imageUrl={data.speaker.imageUrl} size="lg" />
          <div>
            <Chip accent="violet" className="mb-1.5">
              <Icon name="mic" className="size-3" /> You are speaking
            </Chip>
            <h2 className="font-display text-2xl leading-tight">Your sessions</h2>
            <p className="text-sm text-muted">
              {plural(data.speakingSessions.length, 'session')}
              {data.speaker.avgRating > 0 && ` · speaker rating ${data.speaker.avgRating.toFixed(2)}`}
            </p>
          </div>
        </div>
        <Button to={`/speakers/${data.speaker.id}`} size="sm">
          Public profile <Icon name="chevronRight" className="size-3.5" />
        </Button>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {data.speakingSessions.map((s) => {
          const v = accent(s.venue.accent);
          const pct = Math.round(s.fillRate * 100);
          return (
            <Link
              key={s.id}
              to={`/sessions/${s.id}`}
              className="group flex flex-col rounded-2xl border border-hairline bg-surface/80 p-4 transition-colors hover:border-ink/15 hover:bg-raised/70"
            >
              <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-muted">{dayLabel(s.day).replace(',', ' ·')}</span>
                <span className="text-ink">{s.startsAt}</span>
              </div>
              <h3 className="mt-2 line-clamp-2 font-semibold leading-snug group-hover:text-violet-200">{s.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" className="size-3" />{s.room.name}
                </span>
                {!s.venue.isPrimary && (
                  <span className={cx('inline-flex items-center gap-1 font-semibold', v.text)}>
                    <Icon name="car" className="size-3" />{s.venue.shortName}
                  </span>
                )}
              </div>
              <div className="mt-auto pt-4">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-faint">Registered</span>
                  <span className="font-mono text-ink">{s.seatsTaken.toLocaleString()} / {s.capacity.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-overlay">
                  <div className={cx('h-full rounded-full', pct >= 95 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400')}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const MAX_LISTED_CONFLICTS = 3;

/**
 * The hours a day heading shows. The total tile sums these, so the two agree.
 * Hours are hours you hold a chair for; a waitlist place is counted, and
 * shown, apart — it may never come good, so adding it to "booked" overstates
 * the day.
 */
const hoursOn = (day) => Math.round(day.totalMinutes / 60);
const waitlistedHoursOn = (day) => Math.round(day.waitlistedMinutes / 60);

function ConflictBanner({ day, conflicts }) {
  if (!conflicts.length) return null;
  const byId = Object.fromEntries(day.sessions.map((s) => [s.id, s]));
  const listed = conflicts.slice(0, MAX_LISTED_CONFLICTS);
  const hidden = conflicts.length - listed.length;

  return (
    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4" data-testid="conflict-banner">
      <div className="flex items-start gap-2.5">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-rose-300" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-rose-200">
            {plural(conflicts.length, 'clash')} on this day
          </h3>
          <ul className="mt-2 space-y-2">
            {listed.map((c, i) => {
              const items = c.sessionIds.map((id) => byId[id]).filter(Boolean);
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span className="font-mono text-[11px] text-faint">{items[0]?.startsAt}</span>
                  {items.map((s, n) => (
                    <span key={s.id} className="flex items-center gap-2">
                      {n > 0 && <span className="text-rose-400/70">vs</span>}
                      <Link to={`/sessions/${s.id}`} className="text-muted underline-offset-2 hover:text-ink hover:underline">
                        {s.title}
                      </Link>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
          {hidden > 0 && (
            <p className="mt-2 text-[12px] text-faint">and {plural(hidden, 'more clash', 'more clashes')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Every talk they sat through and have not rated, on any day. The home page
 * only asks about today, so without this a Day 1 session is never asked about
 * again once Day 2 starts. Drawn from the agenda, so only seats they still hold.
 */
function ToRateCallout({ days }) {
  const { clock, reservationFor } = useConference();
  const toRate = days.flatMap((d) => d.sessions).filter((s) =>
    reservationFor(s.id) === 'confirmed' && hasEnded(s, clock) && s.checkedIn && s.myStars == null);
  if (!toRate.length) return null;

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5" data-testid="to-rate">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <Icon name="star" className="size-4" />
        {plural(toRate.length, 'session')} to rate
      </h2>
      <ul className="mt-3 space-y-1.5">
        {toRate.map((s) => (
          <li key={s.id} className="flex min-w-0 items-baseline gap-2.5 text-[13px]">
            <span className="shrink-0 font-mono text-[11px] text-faint">{dayLabel(s.day).replace(',', ' ·')}</span>
            <Link to={`/sessions/${s.id}`} className="truncate text-muted underline-offset-2 hover:text-ink hover:underline">
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayPlan({ day, isToday }) {
  const { clock, reservationFor } = useConference();
  const venues = day.venuesVisited;
  return (
    <section data-testid={`plan-day-${day.date}`} className="scroll-mt-24" id={`day-${day.date}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-2xl">
          {dayLabel(day.date)}
          {isToday && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-rose-400" />
              Today
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{plural(day.sessions.length, 'session')}</span>
          <span className="text-faint">·</span>
          <span>{hoursOn(day)}h of content</span>
          {/* without this a day of nothing but queues reads "0h of content" */}
          {day.waitlistedMinutes > 0 && (
            <span className="text-amber-300">+{waitlistedHoursOn(day)}h waitlisted</span>
          )}
          {venues.length > 1 && (
            <Chip accent="amber" className="!py-0.5">
              <Icon name="car" className="size-3" /> {venues.join(' + ')}
            </Chip>
          )}
        </div>
      </div>

      <ConflictBanner day={day} conflicts={day.conflicts} />

      <div className="mt-4 space-y-2">
        {day.sessions.map((s) => (
          <SessionCard key={s.id} session={s} variant="row"
            attendance={reservationFor(s.id) === 'confirmed'
              ? { ended: hasEnded(s, clock), checkedIn: s.checkedIn, myStars: s.myStars }
              : null} />
        ))}
      </div>
    </section>
  );
}

export function MyAgendaPage() {
  const { currentUser, reservationFor, clock } = useConference();
  useDocumentTitle(currentUser ? `${currentUser.name.split(' ')[0]}’s agenda` : 'My agenda');
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUser.id), [currentUser.id]);

  /*
   * The fetched agenda is a snapshot. Removing a row used to leave it on screen
   * until a refresh, so the list is filtered through the store's live
   * reservations instead — remove a session and its row goes immediately, and Undo in
   * the toast brings it straight back because the data is still here.
   */
  const days = useMemo(() => (data?.days ?? [])
    .map((d) => {
      const sessions = d.sessions.filter((s) => reservationFor(s.id));
      const keptIds = new Set(sessions.map((s) => s.id));
      const minutesHeld = (status) => sessions
        .filter((s) => reservationFor(s.id) === status)
        .reduce((n, s) => n + s.durationMins, 0);
      return {
        ...d,
        sessions,
        conflicts: d.conflicts.filter((c) => c.sessionIds.every((id) => keptIds.has(id))),
        totalMinutes: minutesHeld('confirmed'),
        waitlistedMinutes: minutesHeld('waitlisted'),
        venuesVisited: [...new Set(sessions.map((s) => s.venue.shortName))],
      };
    })
    .filter((d) => d.sessions.length > 0), [data, reservationFor]);

  const totalSessions = days.reduce((n, d) => n + d.sessions.length, 0);
  const totalReserved = days.reduce((n, d) => n + d.sessions.filter((s) => reservationFor(s.id) === 'confirmed').length, 0);
  const totalWaitlisted = days.reduce((n, d) => n + d.sessions.filter((s) => reservationFor(s.id) === 'waitlisted').length, 0);
  const waitlisted = days.flatMap((d) => d.sessions.filter((s) => reservationFor(s.id) === 'waitlisted'))
    .sort((a, b) => a.day.localeCompare(b.day) || a.startsAt.localeCompare(b.startsAt));
  const [showWaitlist, setShowWaitlist] = useState(false);
  // leaving the last waitlist place empties the panel, so close it rather than
  // have it spring open again on the next place joined
  useEffect(() => { if (!totalWaitlisted) setShowWaitlist(false); }, [totalWaitlisted]);
  const totalConflicts = days.reduce((n, d) => n + d.conflicts.length, 0);
  /*
   * Summed from what each day heading shows rather than from the raw minutes:
   * sessions are 45 minutes, so a rounded sum would print 5h over two days
   * reading 2h each, and a total that contradicts the days below it reads as
   * a bug rather than as an answer.
   */
  const totalHours = days.reduce((n, d) => n + hoursOn(d), 0);
  const waitlistedHours = days.reduce((n, d) => n + waitlistedHoursOn(d), 0);
  const waitlistedMinutes = days.reduce((n, d) => n + d.waitlistedMinutes, 0);
  const crossVenueDays = days.filter((d) => d.venuesVisited.length > 1).length;

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow={currentUser.ticketTier === 'Speaker' ? 'Speaker view' : 'Attendee view'}
        title={`${currentUser.name.split(' ')[0]}’s agenda`}
        description={
          <>
            The sessions you hold a seat for. Adding one takes a real chair out of the room,
            so if you change your mind, remove it and someone else can go.
            {totalWaitlisted > 0 && ` You are on ${plural(totalWaitlisted, 'waitlist')}.`}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Button href={api.agendaCalendarUrl(currentUser.id)} size="sm" data-testid="export-calendar">
              <Icon name="calendar" className="size-3.5" /> Add to calendar
            </Button>
            <Button to="/schedule" size="sm">Add more <Icon name="chevronRight" className="size-3.5" /></Button>
          </div>
        }
      />

      {days.length > 0 && <NextUpCard days={days} />}

      {currentUser.isSpeaker && <SpeakingPanel user={currentUser} />}

      {error && <ErrorState error={error} onRetry={reload} />}

      {loading && <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>}

      {data && (
        <>
          <ToRateCallout days={days} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat value={totalReserved} label="Seats booked" accent="emerald" />
            <Stat
              value={totalHours}
              label="Hours booked"
              accent="cyan"
              testId="stat-hours-booked"
              note={waitlistedMinutes > 0 && (
                <span data-testid="stat-hours-waitlisted">+{waitlistedHours}h waitlisted</span>
              )}
            />
            <Stat
              value={totalWaitlisted > 0 ? (
                <button type="button" onClick={() => setShowWaitlist((v) => !v)} aria-expanded={showWaitlist}
                  aria-controls="waitlist-list" className="underline decoration-dotted underline-offset-4">
                  {totalWaitlisted}
                </button>
              ) : totalWaitlisted}
              label="On a waitlist"
              accent={totalWaitlisted ? 'amber' : 'emerald'}
              testId="stat-waitlist"
            />
            <Stat value={totalConflicts} label="Time clashes" accent={totalConflicts ? 'rose' : 'emerald'} />
            <Stat value={crossVenueDays} label="Cross-town days" accent="amber" />
          </div>

          {showWaitlist && waitlisted.length > 0 && (
            <section id="waitlist-list" data-testid="waitlist-list" className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
              <h2 className="text-sm font-semibold text-amber-200">
                Waiting for a seat in {plural(waitlisted.length, 'session')}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {waitlisted.map((s) => (
                  <li key={s.id}>
                    <Link to={`/sessions/${s.id}`} data-testid={`waitlist-item-${s.id}`}
                      className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[13px] text-muted hover:text-ink">
                      <span className="shrink-0 font-mono text-[11px] text-faint">
                        {dayLabel(s.day).replace(',', ' ·')} · {time(s.startsAt)}
                      </span>
                      <span className="min-w-0 break-words underline-offset-2 hover:underline">{s.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {days.length === 0 ? (
            <EmptyState
              icon="ticket"
              title="No sessions yet"
              description="Add sessions from the schedule and they collect here, grouped by day."
              action={<Button to="/schedule" variant="primary" size="sm">Browse the schedule</Button>}
            />
          ) : (
            <div className="space-y-12">
              {days.map((d) => <DayPlan key={d.date} day={d} isToday={d.date === clock.day} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
