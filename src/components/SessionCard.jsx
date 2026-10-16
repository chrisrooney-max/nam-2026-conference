import { Link } from 'react-router-dom';
import { accent } from '../lib/accents.js';
import { plural, timeRange } from '../lib/format.js';
import { useConference } from '../lib/store.jsx';
import { Avatar, Chip, SeatButton, Rating, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { GeneratedCover } from './GeneratedCover.jsx';
import { LiveBadge } from './LiveNow.jsx';
import { hasEnded, progressOf, toMinutes } from '../lib/clock.js';

/**
 * Where a held seat stands once the doors have opened: rated, checked in (with
 * a way to rate it once it is over), or missed. Upcoming sessions and waitlist
 * places say nothing — the caller passes `attendance` only for confirmed seats.
 */
function AttendanceStatus({ session, attendance }) {
  const { clock } = useConference();
  if (!attendance) return null;
  // Nothing may claim to be true before it can be: the seed records Day 1's
  // morning as attended and rated, so at 08:00 a 09:00 talk would read
  // "Rated ★5". Status starts when check-in opens, 15 minutes before.
  const open = clock.day > session.day ||
    (clock.day === session.day && toMinutes(clock.time) >= toMinutes(session.startsAt) - 15);
  if (!open) return null;
  const { ended, checkedIn, myStars } = attendance;
  let body;
  if (myStars != null) {
    body = <span className="font-semibold text-violet-200">Rated ★{myStars}</span>;
  } else if (checkedIn) {
    body = (
      <>
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
          <Icon name="check" className="size-3" /> Checked in
        </span>
        {ended && (
          // above the card's full-cover link, so it is its own target
          <Link to={`/sessions/${session.id}`} aria-label={`Rate ${session.title}`}
            className="relative z-10 font-semibold text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline">
            Rate it
          </Link>
        )}
      </>
    );
  } else if (ended) {
    body = <span className="text-faint">Missed</span>;
  } else {
    return null;
  }
  return (
    <span data-testid="attendance-status" className="inline-flex items-center gap-2">{body}</span>
  );
}

/**
 * The workhorse card, in two layouts:
 *   variant="grid" — schedule grid and search results
 *   variant="row"  — compact, used inside day timelines and speaker pages
 *
 * The grid card is deliberately banded: a coloured track rail, a header strip,
 * the body, then a footer strip. The bands are what let you scan a wall of
 * these without every card melting into the next.
 */
export function SessionCard({ session, variant = 'grid', showDay = false, attendance = null }) {
  const { toggleSeat, clock, reservationFor, seatsFor } = useConference();
  const reservation = reservationFor(session.id);
  const onAgenda = Boolean(reservation);

  // Live state, relative to the conference clock.
  const onToday = clock?.day === session.day;
  const nowMins = clock ? toMinutes(clock.time) : -1;
  const isLive = onToday && nowMins >= toMinutes(session.startsAt) && nowMins < toMinutes(session.endsAt);
  // Done on any earlier day too, not just once today's end time has passed.
  const isDone = hasEnded(session, clock);
  const a = accent(session.track.color);
  const v = accent(session.venue.accent);
  // Live counts win over the payload the list was fetched with.
  const live = seatsFor(session.id);
  const seatsLeft = live?.seatsLeft ?? session.seatsLeft;
  const waiting = live?.waitlistCount ?? session.waitlistCount ?? 0;
  const isFull = seatsLeft === 0;
  const offsite = !session.venue.isPrimary;

  if (variant === 'row') {
    return (
      <div data-testid="session-card" data-done={isDone ? 'true' : 'false'} className={cx(
        'group relative flex scroll-mt-28 items-stretch gap-0 overflow-hidden rounded-xl border bg-raised transition-colors',
        'hover:border-ink/20 hover:bg-overlay',
        isLive ? 'border-rose-400/45' : onAgenda ? 'border-emerald-400/30' : 'border-hairline',
        isDone && 'opacity-55',
      )}>
        <span className={cx('w-1 shrink-0 bg-gradient-to-b', a.grad)} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-start gap-3 p-3">
          <div className="w-[4.25rem] shrink-0 pt-0.5">
            <div className="font-mono text-xs font-semibold text-ink">{session.startsAt}</div>
            <div className="font-mono text-[10px] text-faint">{session.endsAt}</div>
            {isLive && <LiveBadge className="mt-1 !px-1.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <Link to={`/sessions/${session.id}`} className="block focus-visible:outline-none">
              <span className="absolute inset-0" aria-hidden="true" />
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-violet-200">
                {session.title}
              </h3>
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className={cx('inline-flex items-center gap-1.5 font-semibold', a.text)}>
                <span className={cx('size-1.5 rounded-full', a.dot)} />
                {session.track.name}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" className="size-3" />
                {session.room.name}
              </span>
              {offsite && (
                <span className={cx('inline-flex items-center gap-1 font-semibold', v.text)}>
                  <Icon name="car" className="size-3" /> {session.venue.shortName}
                </span>
              )}
              <AttendanceStatus session={session} attendance={attendance} />
              {reservation === 'waitlisted' && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  <Icon name="clock" className="size-3" /> Waitlisted
                </span>
              )}
            </div>
          </div>
          <SeatButton size="sm" status={reservation} ended={isDone} onClick={() => toggleSeat(session.id, session)} />
        </div>
      </div>
    );
  }

  // Feature treatment is for keynotes only. It was also firing on any room over
  // 1,200 seats, but the daily room set includes big halls, so most of the list
  // ended up "featured" — which is the same as nothing being featured.
  const feature = session.isKeynote;

  return (
    <article
      data-testid="session-card"
      data-done={isDone ? 'true' : 'false'}
      className={cx(
        'group relative flex scroll-mt-28 flex-col overflow-hidden rounded-xl border bg-raised transition-colors duration-150',
        'hover:border-ink/20 hover:bg-overlay/70',
        isLive ? 'border-rose-400/50' : onAgenda ? 'border-emerald-400/35' : 'border-hairline',
        feature && 'sm:col-span-2',
        isDone && 'opacity-60',
      )}
    >
      {/* Track rail — the primary way to tell cards apart at a glance. */}
      <span className={cx('absolute inset-y-0 left-0 z-10 w-1 bg-gradient-to-b', a.grad)} aria-hidden="true" />

      {feature && (
        <div className="relative h-20 overflow-hidden border-b border-hairline">
          <GeneratedCover seed={session.title} accent={session.track.color}
            variant="orbit" className="size-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/35 to-transparent" />
          <div className="absolute bottom-2 left-5 flex items-center gap-2">
            <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              Keynote
            </span>
            <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
              {session.room.capacity.toLocaleString()} seats
            </span>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 px-4 pl-5 pt-3.5">
        <div className="min-w-0">
          <span className={cx('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide', a.text)}>
            <span className={cx('size-1.5 shrink-0 rounded-full', a.dot)} />
            <span className="truncate">{session.track.name}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            {showDay && <span className="text-faint">{session.day.slice(5)}</span>}
            <Icon name="clock" className="size-3 shrink-0 text-faint" />
            {timeRange(session.startsAt, session.endsAt)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLive && <LiveBadge />}
          <SeatButton status={reservation} ended={isDone} onClick={() => toggleSeat(session.id, session)} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-5 pb-4 pt-2.5">
        <Link to={`/sessions/${session.id}`} className="focus-visible:outline-none">
          <span className="absolute inset-0" aria-hidden="true" />
          <h3 className={cx(
            'line-clamp-2 font-display leading-snug transition-colors group-hover:text-violet-200',
            feature ? 'text-xl' : 'text-[1.0625rem]',
          )}>
            {session.title}
          </h3>
        </Link>
        {session.subtitle && (
          <p className="mt-1 line-clamp-1 text-[11px] italic text-faint">{session.subtitle}</p>
        )}

        <p className={cx('mt-2.5 text-[12.5px] leading-relaxed text-muted', feature ? 'line-clamp-3' : 'line-clamp-2')}>
          {session.abstract}
        </p>

        {session.speakers?.length > 0 && (
          <div className="mt-4 flex items-center gap-2.5 pt-1">
            <div className="flex -space-x-2">
              {session.speakers.slice(0, 3).map((s) => (
                <Avatar key={s.id} name={s.name} initials={s.initials} accent={s.accent}
                  imageUrl={s.imageUrl} size="sm" className="ring-2 ring-raised" />
              ))}
            </div>
            <div className="min-w-0 text-[11px] leading-tight">
              <div className="truncate font-semibold text-ink">
                {session.speakers[0].name}
                {session.speakers.length > 1 && (
                  <span className="font-normal text-faint"> +{session.speakers.length - 1}</span>
                )}
              </div>
              <div className="truncate text-faint">{session.speakers[0].company}</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-hairline px-4 py-2.5 pl-5 text-[11px] text-muted">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Icon name="pin" className="size-3 shrink-0 text-faint" />
          <span className="truncate font-medium">{session.room.name}</span>
        </span>
        {offsite && (
          <Chip accent={session.venue.accent} className="!py-0.5 !text-[10px]">
            <Icon name="car" className="size-3" /> {session.venue.shortName}
          </Chip>
        )}
        <span className="text-faint">{session.format}</span>
        <span className="text-overlay">·</span>
        <span className="text-faint">{session.level}</span>
        <div className="ml-auto flex items-center gap-2.5">
          {/* How full it is, so the list answers "can I still get in?" without a
              click. Keynotes say it on their cover strip already, and a session
              with no capacity says nothing rather than reading as sold out. */}
          {!feature && session.capacity > 0 && (
            isFull ? (
              <span data-testid="card-seats"
                className="rounded-full bg-rose-500/15 px-2 py-0.5 font-bold text-rose-200">
                Full{waiting > 0 && ` · ${waiting} waiting`}
              </span>
            ) : (
              <span data-testid="card-seats"
                className={cx('font-semibold', seatsLeft <= 10 ? 'text-amber-300' : 'text-faint')}>
                {plural(seatsLeft, 'seat')} left
              </span>
            )
          )}
          {session.isRecorded && <Icon name="play" className="size-3 text-faint" />}
          <Rating value={session.avgRating} count={session.ratingCount} />
        </div>
      </div>

      {isLive && (
        <div className="h-1 w-full bg-overlay">
          <div className={cx('h-full bg-gradient-to-r transition-all duration-1000', a.grad)}
            style={{ width: `${Math.round(progressOf(session, clock.time) * 100)}%` }} />
        </div>
      )}
    </article>
  );
}
