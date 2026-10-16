import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { plural, time as fmtTime } from '../lib/format.js';
import { hasEnded, relativeToNow } from '../lib/clock.js';
import { assessTravel } from '../lib/travel.js';
import { Button, Chip, SeatButton, Skeleton, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/** One booked session, with the two facts you need to actually get there. */
function BookedRow({ session, now, live }) {
  const a = accent(session.track.color);
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="group relative flex flex-1 items-start gap-3 overflow-hidden rounded-xl border border-hairline bg-raised p-4 transition-colors hover:border-ink/20 hover:bg-overlay/70"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} />
      <div className="min-w-0 flex-1 pl-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip accent={live ? 'rose' : 'cyan'} className="!py-0.5 !text-[10px]">
            <Icon name="clock" className="size-3" />
            {live ? `ends ${relativeToNow(session.endsAt, now)}` : relativeToNow(session.startsAt, now)}
          </Chip>
          <span className="font-mono text-[11px] text-muted">{fmtTime(session.startsAt)}</span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-violet-200">
          {session.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" className="size-3 text-faint" />{session.room.name}
          </span>
          {!session.venue.isPrimary && <span className="font-semibold text-orange-300">· {session.venue.shortName}</span>}
          <span className="text-faint">· ~{session.room.walkMinutes} min walk</span>
        </p>
      </div>
    </Link>
  );
}

/**
 * The attendee's own day, driven by the conference clock.
 *
 * This block used to render `days[0]` — the first day they had anything booked
 * — so on day 3 it cheerfully showed day 1. Everything here is today, and only
 * today.
 */
export function TodayPanel() {
  const { currentUser, clock, days, venues, travel, toggleSeat, reservationFor } = useConference();
  const { data, loading } = useFetch(
    () => api.getToday(currentUser.id, clock),
    [currentUser.id, clock.day, clock.time],
  );

  const dayLabel = days.find((d) => d.date === clock.day)?.label ?? 'Today';
  // Only skeleton on the first load — the clock refetches this every minute.
  if (loading && !data) return <Skeleton className="h-44" />;
  if (!data) return null;

  const { current, next, finished, unrated, waitlisted, openSlot, suggestions } = data;
  const nothingBooked = !current && !next && finished.length === 0;

  /*
   * Two sites, six miles apart. The app has always detected time overlaps and
   * said nothing about geography — which is the one thing this conference's
   * layout makes hard.
   */
  const from = current ?? finished[finished.length - 1];
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const travelCheck = next && from
    ? assessTravel({ travel, from, to: next, gapMinutes: mins(next.startsAt) - mins(from.endsAt) })
    : null;
  const travelWarning = travelCheck && (travelCheck.impossible || travelCheck.freeTooSlow)
    ? travelCheck
    : null;

  return (
    <section data-testid="today-panel">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">
            {dayLabel} · {currentUser.name.split(' ')[0]}
          </div>
          <h2 className="font-display text-2xl leading-tight sm:text-3xl">Your day</h2>
        </div>
        <Button to="/my-agenda" size="sm">
          Full agenda <Icon name="chevronRight" className="size-3.5" />
        </Button>
      </div>

      {nothingBooked ? (
        <div className="card p-6" data-testid="today-empty">
          <h3 className="font-display text-lg">Nothing booked today</h3>
          <p className="mt-1.5 max-w-lg text-[13px] text-muted">
            {currentUser.interests.length
              ? `You said you were here for ${currentUser.interests.slice(0, 2).join(' and ')}. Here is what is on.`
              : 'Pick something from the schedule and it lands here.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {currentUser.interests.slice(0, 4).map((i) => (
              <Chip key={i} as={Link} to={`/schedule?day=${clock.day}&q=${encodeURIComponent(i)}`}
                accent="violet" className="transition-opacity hover:opacity-80">
                {i}
              </Chip>
            ))}
            <Button to={`/schedule?day=${clock.day}`} size="sm" variant="primary">
              Browse today
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            {current && <BookedRow session={current} now={clock.time} live />}
            {next && <BookedRow session={next} now={clock.time} />}
            {!current && !next && (
              <div className="flex flex-1 items-center gap-3 rounded-xl border border-dashed border-hairline p-4 text-[13px] text-muted">
                <Icon name="check" className="size-4 shrink-0 text-emerald-400" />
                That is your day — {plural(finished.length, 'session')} done.
              </div>
            )}
          </div>

          {travelWarning && (
            <div
              className={cx('rounded-xl border px-4 py-3 text-[12px]',
                travelWarning.impossible
                  ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-200'
                  : 'border-amber-500/30 bg-amber-500/[0.08] text-amber-200')}
              data-testid="travel-warning"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon name="car" className="size-4 shrink-0" />
                <strong className="font-semibold">
                  {travelWarning.impossible
                    ? 'You cannot make this one'
                    : 'Tight — and not on the free shuttle'}
                </strong>
                <span className="text-muted">
                  {travelWarning.gapMinutes} min between {from.venue.shortName} and {next.venue.shortName},
                  plus a {travelWarning.walk} min walk at the far end.
                </span>
                <Link to={`/sessions/${next.id}`} className="ml-auto shrink-0 font-semibold underline underline-offset-2">
                  Review
                </Link>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                {travelWarning.options.map((o) => (
                  <li key={o.mode} className={cx('flex items-center gap-1.5', o.fits ? 'text-emerald-300' : 'text-faint line-through')}>
                    <Icon name={o.fits ? 'check' : 'close'} className="size-3" />
                    {o.mode} {o.total} min{o.costUsd ? ` · $${o.costUsd.toFixed(2)}` : ' · free'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Things waiting on a decision */}
      {(waitlisted.length > 0 || unrated.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {waitlisted.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4" data-testid="waitlist-strip">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
                <Icon name="clock" className="size-4" />
                {plural(waitlisted.length, 'waitlist place')}
              </h3>
              <ul className="mt-2 space-y-1">
                {waitlisted.slice(0, 2).map((s) => (
                  <li key={s.id} className="truncate text-[12px] text-muted">
                    <Link to={`/sessions/${s.id}`} className="hover:text-ink">
                      {fmtTime(s.startsAt)} · {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unrated.length > 0 && (
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4" data-testid="rate-strip">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-violet-200">
                <Icon name="star" className="size-4" />
                Rate what you attended
              </h3>
              <ul className="mt-2 space-y-1">
                {unrated.slice(0, 2).map((s) => (
                  <li key={s.id} className="truncate text-[12px]">
                    <Link to={`/sessions/${s.id}`} className="text-muted hover:text-ink">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* A gap in the day, filled from what they actually book */}
      {openSlot && suggestions.length > 0 && (
        <div className="mt-3 rounded-xl border border-hairline bg-surface p-4" data-testid="suggestions">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold">
              You are free at {fmtTime(openSlot)}
            </h3>
            <span className="text-[11px] text-faint">picked from what you have been booking</span>
          </div>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => {
              const a = accent(s.track.color);
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span className={cx('size-1.5 shrink-0 rounded-full', a.dot)} />
                  <Link to={`/sessions/${s.id}`} className="min-w-0 flex-1 truncate text-[13px] text-muted hover:text-ink">
                    {s.title}
                  </Link>
                  <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{s.room.name}</span>
                  <SeatButton size="sm" status={reservationFor(s.id)} ended={hasEnded(s, clock)} onClick={() => toggleSeat(s.id, s)} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
