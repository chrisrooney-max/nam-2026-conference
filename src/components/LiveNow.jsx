import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { progressOf, relativeToNow } from '../lib/clock.js';
import { plural, time as fmtTime } from '../lib/format.js';
import { Avatar, Button, Chip, Skeleton, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/** The pulsing red dot + "LIVE" used wherever something is in progress. */
export function LiveBadge({ className, label = 'Live' }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5',
      'text-[10px] font-bold uppercase tracking-wider text-rose-300',
      className,
    )}>
      <span className="size-1.5 animate-pulse-dot rounded-full bg-rose-400" />
      {label}
    </span>
  );
}

function RunningCard({ session, now, upcoming = false, yours = false }) {
  const a = accent(session.track.color);
  const progress = upcoming ? 0 : progressOf(session, now);
  const minsLeft = Math.max(0, Math.round((1 - progress) * session.durationMins));

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="group relative flex min-w-[17rem] flex-1 flex-col overflow-hidden rounded-xl border border-hairline bg-raised transition-colors hover:border-ink/20 hover:bg-overlay/70"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} />
      <div className="flex flex-1 flex-col p-4 pl-5">
        <div className="flex items-center justify-between gap-2">
          <span className={cx('truncate text-[10px] font-bold uppercase tracking-wider', a.text)}>
            {session.track.name}
          </span>
          {yours && (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              Yours
            </span>
          )}
          <span className={cx('shrink-0 font-mono text-[11px] font-semibold', upcoming ? 'text-cyan-300' : 'text-rose-300')}>
            {upcoming ? relativeToNow(session.startsAt, now) : `${minsLeft} min left`}
          </span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-violet-200">
          {session.title}
        </h3>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <Icon name="pin" className="size-3 shrink-0 text-faint" />
          <span className="truncate">{session.room.name}</span>
          {!session.venue.isPrimary && (
            <span className="shrink-0 font-semibold text-orange-300">· {session.venue.shortName}</span>
          )}
        </div>
        {session.speakers?.[0] && (
          <div className="mt-3 flex items-center gap-2">
            <Avatar name={session.speakers[0].name} initials={session.speakers[0].initials}
              accent={session.speakers[0].accent} size="xs" />
            <span className="truncate text-[11px] text-faint">{session.speakers[0].name}</span>
          </div>
        )}
      </div>
      {/* how far through the session we are */}
      {!upcoming && (
        <div className="h-1 w-full bg-overlay">
          <div className={cx('h-full bg-gradient-to-r transition-all duration-1000', a.grad)}
            style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </Link>
  );
}

/**
 * The live strip: what is running at the current conference time, and what
 * starts next. This is the thing that makes the app feel like a conference
 * rather than a catalogue.
 */
export function LiveNow() {
  const { clock, days, reservationFor } = useConference();
  const { data, loading } = useFetch(
    () => api.getLive({ day: clock.day, time: clock.time }),
    [clock.day, clock.time],
  );

  const dayLabel = days.find((d) => d.date === clock.day)?.label ?? 'Day 1';
  const running = data?.happeningNow ?? [];
  const next = data?.upNext ?? [];

  /*
   * Four honest states, decided by the clock against the day's own bounds —
   * not by whether an array happens to be empty. Branching on array lengths
   * produced "the day has not started" at 21:45 and "everyone is changing
   * rooms" at 07:15.
   */
  const mins = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const nowMins = mins(clock.time);
  const startsAt = mins(data?.dayStartsAt);
  const endsAt = mins(data?.dayEndsAt);

  const phase = loading && !data ? 'loading'
    : startsAt !== null && nowMins < startsAt ? 'before'
    : endsAt !== null && nowMins >= endsAt ? 'after'
    : running.length > 0 ? 'running'
    : next.length > 0 ? 'gap'
    : 'after';

  const inGap = phase === 'gap';
  const featured = running.length ? running : next;
  const mine = (id) => reservationFor(id);

  return (
    <section data-testid="live-now">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <LiveBadge label={
              phase === 'before' ? 'Not started'
                : phase === 'after' ? 'Wrapped'
                : inGap ? 'Between slots'
                : 'Live'
            } />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
              {dayLabel} · {fmtTime(clock.time)}
            </span>
          </div>
          <h2 className="font-display text-2xl leading-tight sm:text-3xl">
            {phase === 'before' ? 'Not started yet'
              : phase === 'after' ? `${dayLabel} is done`
              : inGap ? 'Everyone is changing rooms'
              : 'Happening right now'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {phase === 'before'
              ? `Doors are open. The first session is at ${fmtTime(data.dayStartsAt)} — ${relativeToNow(data.dayStartsAt, clock.time)}.`
              : phase === 'after'
                ? 'Nothing more on the programme today.'
                : inGap
                  ? `${plural(next.length, 'session')} starting at ${fmtTime(data.nextSlot)} — ${relativeToNow(data.nextSlot, clock.time)}.`
                  : `${plural(running.length, 'session')} in progress across both sites.`}
          </p>
        </div>
        <Button to={`/schedule?day=${clock.day}`} size="sm">
          Full day <Icon name="chevronRight" className="size-3.5" />
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 flex-1" />)}
        </div>
      ) : (
        <>
          <div className="stagger hide-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {[...featured].sort((a, b) => Number(Boolean(mine(b.id))) - Number(Boolean(mine(a.id)))).slice(0, 4).map((s, i) => (
              <div key={s.id} style={{ '--i': i }} className="flex min-w-[17rem] snap-start sm:min-w-0 sm:flex-1">
                <RunningCard session={s} now={clock.time} upcoming={inGap || phase === 'before'} yours={Boolean(mine(s.id))} />
              </div>
            ))}
          </div>

          {next.length > 0 && !inGap && phase !== 'after' && (
            <div className="mt-4 rounded-xl border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Chip accent="cyan" className="!py-0.5">
                  <Icon name="clock" className="size-3" />
                  Up next {relativeToNow(data.nextSlot, clock.time)}
                </Chip>
                <span className="text-xs text-muted">
                  {plural(next.length, 'session')} starting at {fmtTime(data.nextSlot)}
                </span>
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {next.slice(0, 6).map((s) => {
                  const a = accent(s.track.color);
                  return (
                    // grid items default to min-width:auto, which stops `truncate`
                    // from ever shrinking — hence min-w-0 on both levels
                    <li key={s.id} className="min-w-0">
                      <Link to={`/sessions/${s.id}`} className="group flex min-w-0 items-center gap-2 text-[13px]">
                        <span className={cx('size-1.5 shrink-0 rounded-full', a.dot)} />
                        <span className="min-w-0 truncate text-muted group-hover:text-ink">{s.title}</span>
                        <span className="ml-auto hidden shrink-0 text-[11px] text-faint sm:inline">{s.room.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
