import { Link, useParams } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { dayLabel, plural, relativeDate, timeRange } from '../lib/format.js';
import { routesBetween } from '../lib/travel.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { GeneratedCover } from '../components/GeneratedCover.jsx';
import { SeatPanel } from '../components/SeatPanel.jsx';
import { AttendancePanel } from '../components/AttendancePanel.jsx';
import { Avatar, Button, Chip, ErrorState, NotFoundState, Rating, Skeleton, TrackPill, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { hasEnded } from '../lib/clock.js';

function TravelNotice({ session }) {
  const { venues, travel } = useConference();
  if (session.venue.isPrimary) return null;
  const home = venues.find((v) => v.isPrimary);
  const options = routesBetween(travel, home.id, session.venue.id).filter((r) => r.mode !== 'Walk');

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4" data-testid="travel-notice">
      <div className="flex items-start gap-2.5">
        <Icon name="car" className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-200">This one is across town</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {session.venue.name} is a separate site from {home.shortName}. Allow travel time on both sides.
          </p>
          <ul className="mt-3 space-y-1.5">
            {options.map((o) => (
              <li key={o.mode} className="flex items-baseline gap-2 text-[12px]">
                <span className="w-20 shrink-0 font-medium text-ink">{o.mode}</span>
                <span className="font-mono text-amber-200">{o.minutes} min</span>
                <span className="text-faint">{o.costUsd ? `≈ $${o.costUsd.toFixed(2)}` : 'free'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function SessionPage() {
  const { id } = useParams();
  const { currentUserId, reservationFor, toggleSeat, seatsFor, clock } = useConference();
  const { data: session, loading, error, reload } = useFetch(() => api.getSession(id, currentUserId), [id, currentUserId]);
  const notFound = error?.status === 404;
  useDocumentTitle(notFound ? 'Not found' : session?.title);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (notFound) return <NotFoundState title="Session not found" backTo="/schedule" backLabel="Browse the schedule" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!session) return <NotFoundState title="Session not found" backTo="/schedule" backLabel="Browse the schedule" />;

  const a = accent(session.track.color);
  const reservation = reservationFor(session.id);
  // Over: nothing to add. A seat already held stays, and can still be released.
  const ended = hasEnded(session, clock);
  const closed = ended && !reservation;
  const live = seatsFor(session.id);
  const seatsLeft = live?.seatsLeft ?? session.seats?.seatsLeft ?? session.seatsLeft;
  const waiting = live?.waitlistCount ?? session.seats?.waitlistCount ?? 0;
  const isFull = seatsLeft === 0;
  const topicTags = session.tags.filter((t) => t.kind === 'topic');
  const otherTags = session.tags.filter((t) => t.kind !== 'topic');

  return (
    <div className="space-y-10" data-testid="session-detail">
      <Button to="/schedule" variant="subtle" size="sm" className="-ml-2">
        <Icon name="chevronLeft" className="size-3.5" /> Back to schedule
      </Button>

      <header className="relative overflow-hidden rounded-3xl border border-hairline bg-surface/70">
        <span className={cx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', a.grad)} />
        <div className="p-6 sm:p-9">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <TrackPill track={session.track} />
            <Chip>{session.format}</Chip>
            <Chip>{session.level}</Chip>
            {session.language !== 'English' && <Chip accent="sky">{session.language}</Chip>}
            {session.isKeynote && session.format !== 'Keynote' && <Chip accent="violet">Keynote</Chip>}
            {session.requiresRsvp && <Chip accent="amber">RSVP required</Chip>}
          </div>

          <h1 className="mt-4 max-w-4xl font-display text-3xl leading-tight sm:text-5xl" data-testid="session-title">
            {session.title}
          </h1>
          {session.subtitle && <p className="mt-2 text-base italic text-muted">{session.subtitle}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <Icon name="calendar" className="size-4 text-faint" />
              <span>{dayLabel(session.day)}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Icon name="clock" className="size-4 text-faint" />
              <span className="font-mono">{timeRange(session.startsAt, session.endsAt)}</span>
              <span className="text-faint">({session.durationMins} min)</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Icon name="pin" className="size-4 text-faint" />
              <span>{session.room.name}</span>
              <span className="text-faint">· {session.room.building}, {session.room.floor}</span>
            </span>
            {/* seat state belongs above the fold — it is what changes the decision */}
            {isFull ? (
              <Chip accent="rose" data-testid="header-seats">
                Full{waiting > 0 && ` · ${waiting} waiting`}
              </Chip>
            ) : (
              <Chip accent={seatsLeft <= 10 ? 'amber' : 'emerald'} data-testid="header-seats">
                {plural(seatsLeft, 'seat')} left
              </Chip>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              variant={reservation || closed ? 'ghost' : 'primary'}
              onClick={() => { if (!closed) toggleSeat(session.id, session); }}
              disabled={closed}
              data-testid="save-session"
            >
              <Icon name={reservation === 'waitlisted' || closed ? 'clock' : reservation ? 'check' : 'ticket'} className="size-4" />
              {reservation === 'waitlisted' ? 'On the waitlist'
                : reservation ? 'On my agenda'
                : closed ? 'Session ended'
                : isFull ? 'Join the waitlist'
                : 'Add to my agenda'}
            </Button>
            <Button href={api.sessionCalendarUrl(session.id)}>
              <Icon name="calendar" className="size-3.5" /> Add to calendar
            </Button>
            <Rating value={session.avgRating} count={session.ratingCount} className="ml-auto !text-xs" />
          </div>
          {ended && (
            <p className="mt-3 text-[13px] text-muted" data-testid="session-ended">This session has ended.</p>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {session.isRecorded && (
            <div
              data-testid="video-poster"
              className="relative block aspect-video overflow-hidden rounded-xl border border-hairline"
            >
              <GeneratedCover seed={session.title} accent={session.track.color} variant="orbit" className="size-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-16 place-items-center rounded-full bg-white/15 text-white/80 ring-1 ring-white/25 backdrop-blur-sm sm:size-20">
                  <Icon name="play" filled className="ml-1 size-6 sm:size-7" />
                </span>
              </span>

              <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 p-4 sm:p-5">
                <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Recorded
                </span>
                <span className="text-sm font-semibold text-white">
                  Available 24 hours after the session
                </span>
                <span className="ml-auto font-mono text-xs text-white/70">{session.durationMins} min</span>
              </span>
            </div>
          )}

          <section>
            <h2 className="font-display text-xl">About this session</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{session.abstract}</p>

            {session.takeaways.length > 0 && (
              <>
                <h3 className="mt-7 text-sm font-semibold uppercase tracking-wider text-faint">What you will take away</h3>
                <ul className="mt-3 space-y-2">
                  {session.takeaways.map((t) => (
                    <li key={t} className="flex gap-2.5 text-[14px] text-muted">
                      <Icon name="check" className={cx('mt-0.5 size-4 shrink-0', a.text)} />
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {session.prerequisites && (
              <div className="mt-6 rounded-xl border border-hairline bg-raised/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Before you come</h3>
                <p className="mt-1.5 text-[13px] text-muted">{session.prerequisites}</p>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl">{plural(session.speakers.length, 'Speaker')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {session.speakers.map((sp) => (
                <Link
                  key={sp.id}
                  to={`/speakers/${sp.id}`}
                  className="group flex gap-3.5 rounded-2xl border border-hairline bg-surface/70 p-4 transition-colors hover:border-ink/15 hover:bg-raised/70"
                >
                  <Avatar name={sp.name} initials={sp.initials} accent={sp.accent} imageUrl={sp.imageUrl} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold group-hover:text-violet-200">{sp.name}</h3>
                      {sp.role !== 'Speaker' && (
                        <span className="shrink-0 rounded bg-overlay px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-faint">
                          {sp.role}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted">{sp.jobTitle}</p>
                    <p className="truncate text-xs font-medium text-faint">{sp.company}</p>
                    <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-muted">{sp.bio}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {session.reviews.length > 0 && (
            <section>
              <h2 className="font-display text-xl">Attendee feedback</h2>
              <div className="mt-4 space-y-3">
                {session.reviews.map((r, i) => (
                  <figure key={i} className="rounded-2xl border border-hairline bg-surface/70 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.author.name} initials={r.author.initials} accent={r.author.accent} imageUrl={r.author.imageUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.author.name}</div>
                        <div className="truncate text-[11px] text-faint">{r.author.jobTitle}, {r.author.company}</div>
                      </div>
                      <div className="flex gap-0.5" aria-label={`${r.stars} out of 5`}>
                        {Array.from({ length: 5 }, (_, n) => (
                          <Icon key={n} name="star" filled={n < r.stars} className={cx('size-3', n < r.stars ? 'text-amber-400' : 'text-overlay')} />
                        ))}
                      </div>
                    </div>
                    <blockquote className="mt-3 text-[13px] leading-relaxed text-muted">{r.comment}</blockquote>
                    <figcaption className="mt-2 text-[11px] text-faint">{relativeDate(r.createdAt, clock)}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {session.competing.length > 0 && (
            <section>
              <h2 className="font-display text-xl">Also at {session.startsAt}</h2>
              <p className="mt-1 text-sm text-muted">What you would be giving up.</p>
              <div className="mt-4 space-y-2">
                {session.competing.map((s) => <SessionCard key={s.id} session={s} variant="row" />)}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TravelNotice session={session} />

          <SeatPanel session={session} />

          <AttendancePanel session={session} />

          <div className="card space-y-5 p-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Room</h3>
              <p className="mt-1.5 font-medium">{session.room.name}</p>
              <p className="text-xs text-muted">{session.venue.name}</p>
              <p className="mt-1 text-xs text-faint">
                {session.room.building} · {session.room.floor} · ~{session.room.walkMinutes} min from the entrance
              </p>
              {session.room.amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {session.room.amenities.map((am) => (
                    <Chip key={am} className="!px-2 !py-0.5 !text-[10px]">{am}</Chip>
                  ))}
                </div>
              )}
              {!session.room.accessible && (
                <p className="mt-2.5 text-[11px] text-amber-300">
                  ⚠ Not step-free.{' '}
                  <Link to="/accessibility" className="underline underline-offset-2 hover:text-amber-200">
                    See step-free alternatives
                  </Link>
                </p>
              )}
            </div>

            {topicTags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Topics</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topicTags.map((t) => (
                    <Chip key={t.slug} as={Link} to={`/schedule?tag=${t.slug}`} accent={session.track.color}
                      className="!px-2 !py-0.5 !text-[10px] transition-opacity hover:opacity-80">
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {otherTags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Also tagged</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {otherTags.map((t) => (
                    <Chip key={t.slug} className="!px-2 !py-0.5 !text-[10px]">{t.name}</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>

          {session.alsoInRoom.length > 0 && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Rest of the day in {session.room.name}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {session.alsoInRoom.map((s) => (
                  <li key={s.id}>
                    <Link to={`/sessions/${s.id}`} className="group flex gap-3 text-[13px]">
                      <span className="shrink-0 font-mono text-[11px] text-faint">{s.startsAt}</span>
                      <span className="line-clamp-2 text-muted group-hover:text-ink">{s.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
