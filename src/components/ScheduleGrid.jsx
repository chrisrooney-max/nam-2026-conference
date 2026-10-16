import { Link } from 'react-router-dom';
import { accent } from '../lib/accents.js';
import { useConference } from '../lib/store.jsx';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { Avatar, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * The time × room matrix — the view that actually answers "what is on at once,
 * and what am I giving up". Time runs down, rooms run across, grouped by venue
 * and tinted by the track that room is running that day.
 *
 * Keynotes and social events do not belong to the day's room grid, so they are
 * rendered as full-width bars at their own time.
 */
export function ScheduleGrid({ sessions }) {
  const { reservationFor, toggleSeat, seatsFor, clock } = useConference();

  const gridSessions = sessions.filter((s) => !s.isKeynote && s.format !== 'Social');
  const bannerSessions = sessions.filter((s) => s.isKeynote || s.format === 'Social');

  // Columns: every room in play today, main venue first.
  const roomMap = new Map();
  for (const s of gridSessions) {
    if (!roomMap.has(s.room.id)) roomMap.set(s.room.id, { ...s.room, venue: s.venue, track: s.track });
  }
  const rooms = [...roomMap.values()].sort(
    (a, b) => Number(b.venue.isPrimary) - Number(a.venue.isPrimary) || a.name.localeCompare(b.name),
  );

  const slots = [...new Set(sessions.map((s) => s.startsAt))].sort();
  const cell = (roomId, startsAt) => gridSessions.find((s) => s.room.id === roomId && s.startsAt === startsAt);
  const bannersAt = (startsAt) => bannerSessions.filter((s) => s.startsAt === startsAt);

  if (!rooms.length) return null;

  const nowMins = clock ? toMinutes(clock.time) : -1;
  const sameDay = sessions[0] && clock?.day === sessions[0].day;

  return (
    <div className="card overflow-hidden" data-testid="schedule-grid">
      <div className="overflow-x-auto">
        {/* Columns flex to fill the panel and only scroll once they would be
            narrower than 9rem, so a normal laptop never scrolls sideways. */}
        <div
          className="min-w-[52rem]"
          style={{ '--grid': `5rem repeat(${rooms.length}, minmax(9rem, 1fr))` }}
          role="table"
          aria-label="Schedule by room and time"
        >
          {/* header: room + its track for the day */}
          <div className="sticky top-0 z-20 grid border-b border-hairline bg-surface"
            style={{ gridTemplateColumns: 'var(--grid)' }} role="row">
            <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-faint">
              Time
            </div>
            {rooms.map((room) => {
              const a = accent(room.track.color);
              return (
                <div key={room.id} role="columnheader"
                  className="min-w-0 border-r border-hairline px-3 py-2 last:border-r-0">
                  <div className={cx('mb-1.5 h-0.5 w-full rounded-full bg-gradient-to-r', a.grad)} />
                  <div className="truncate text-xs font-bold">{room.name}</div>
                  <div className="flex items-center gap-1.5">
                    <span className={cx('truncate text-[10px] font-semibold', a.text)}>{room.track.name}</span>
                  </div>
                  {!room.venue.isPrimary && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-orange-300">
                      <Icon name="car" className="size-2.5" />{room.venue.shortName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* one row per time slot */}
          {slots.map((startsAt) => {
            const banners = bannersAt(startsAt);
            const rowCells = rooms.map((room) => cell(room.id, startsAt));
            const hasCells = rowCells.some(Boolean);

            return (
              <div key={startsAt}>
                {banners.map((s) => {
                  const a = accent(s.track.color);
                  const seat = reservationFor(s.id);
                  // Over and not held: nothing left to offer, but a held seat can still go.
                  const closed = !seat && hasEnded(s, clock);
                  return (
                    <div key={s.id} className="grid border-b border-hairline"
                      style={{ gridTemplateColumns: `5rem 1fr` }} role="row">
                      <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-3 py-3 font-mono text-xs font-bold">
                        {startsAt}
                      </div>
                      <Link to={`/sessions/${s.id}`}
                        className="group relative flex flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-raised">
                        <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} />
                        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', a.chip)}>
                          {s.isKeynote ? 'Keynote' : 'Social'}
                        </span>
                        <span className="truncate text-sm font-semibold group-hover:text-violet-200">{s.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-faint">{s.room.name}</span>
                        <button
                          type="button"
                          aria-label={seat ? 'Remove from my agenda' : closed ? 'Session ended' : 'Add to my agenda'}
                          aria-pressed={Boolean(seat)}
                          disabled={closed}
                          onClick={(e) => { e.preventDefault(); if (!closed) toggleSeat(s.id, s); }}
                          className={cx('relative z-10 shrink-0 rounded p-1',
                            seat ? 'text-emerald-300' : closed ? 'cursor-not-allowed text-faint/50' : 'text-faint hover:text-emerald-300')}
                        >
                          <Icon name={seat === 'waitlisted' ? 'clock' : seat ? 'check' : 'ticket'} className="size-4" />
                        </button>
                      </Link>
                    </div>
                  );
                })}

                {hasCells && (
                  <div className="grid border-b border-hairline last:border-b-0"
                    style={{ gridTemplateColumns: 'var(--grid)' }} role="row">
                    <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-hairline bg-surface px-3 py-2">
                      <span className="font-mono text-xs font-bold">{startsAt}</span>
                      <span className="font-mono text-[10px] text-faint">
                        {rowCells.find(Boolean)?.endsAt}
                      </span>
                    </div>

                    {rooms.map((room) => {
                      const s = cell(room.id, startsAt);
                      if (!s) {
                        return (
                          <div key={room.id} className="min-w-0 border-r border-hairline last:border-r-0" role="cell">
                            <div className="grid h-full min-h-[5.5rem] place-items-center text-[11px] text-faint/40">—</div>
                          </div>
                        );
                      }
                      const a = accent(s.track.color);
                      const seat = reservationFor(s.id);
                      const live = sameDay && nowMins >= toMinutes(s.startsAt) && nowMins < toMinutes(s.endsAt);
                      const done = sameDay && nowMins >= toMinutes(s.endsAt);
                      const closed = !seat && hasEnded(s, clock);

                      return (
                        <div key={room.id} className="min-w-0 border-r border-hairline p-1.5 last:border-r-0" role="cell">
                          <Link
                            to={`/sessions/${s.id}`}
                            className={cx(
                              'group relative flex h-full min-h-[5rem] flex-col rounded-lg border p-2.5 transition-all',
                              'hover:-translate-y-0.5 hover:border-ink/25 hover:bg-overlay',
                              live ? 'border-rose-400/50 bg-rose-500/[0.07]'
                                : seat ? 'border-emerald-400/45 bg-emerald-400/[0.06]'
                                : 'border-hairline bg-raised',
                              done && 'opacity-60',
                            )}
                          >
                            <span className={cx('absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-gradient-to-r', a.grad)} />
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="line-clamp-3 text-[12px] font-semibold leading-snug group-hover:text-violet-200">
                                {s.title}
                              </h4>
                              <button
                                type="button"
                                aria-label={seat ? `Remove ${s.title} from my agenda`
                                  : closed ? `${s.title} has ended` : `Add ${s.title} to my agenda`}
                                aria-pressed={Boolean(seat)}
                                disabled={closed}
                                onClick={(e) => { e.preventDefault(); if (!closed) toggleSeat(s.id, s); }}
                                className={cx('relative z-10 -mr-1 -mt-1 shrink-0 rounded p-1 transition-colors',
                                  seat ? 'text-emerald-300'
                                    : closed ? 'cursor-not-allowed text-faint/50 opacity-0 group-hover:opacity-100'
                                    : 'text-faint opacity-0 hover:text-emerald-300 group-hover:opacity-100 focus:opacity-100')}
                              >
                                <Icon name={seat === 'waitlisted' ? 'clock' : seat ? 'check' : 'ticket'} className="size-3.5" />
                              </button>
                            </div>
                            {(() => {
                              const live = seatsFor(s.id);
                              const left = live?.seatsLeft ?? s.seatsLeft;
                              const waiting = live?.waitlistCount ?? s.waitlistCount ?? 0;
                              if (left === 0) {
                                return (
                                  <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300">
                                    Full{waiting > 0 && ` · ${waiting}`}
                                  </span>
                                );
                              }
                              if (left <= 10) {
                                return (
                                  <span className="mt-1.5 text-[10px] font-semibold text-amber-300">{left} left</span>
                                );
                              }
                              return null;
                            })()}
                            <div className="mt-auto flex items-center gap-1.5 pt-2">
                              {s.speakers?.[0] && (
                                <>
                                  <Avatar name={s.speakers[0].name} initials={s.speakers[0].initials}
                                    accent={s.speakers[0].accent} imageUrl={s.speakers[0].imageUrl}
                                    size="xs" ring={false} />
                                  <span className="truncate text-[10px] text-faint">{s.speakers[0].name}</span>
                                </>
                              )}
                              {live && <span className="ml-auto size-1.5 animate-pulse-dot rounded-full bg-rose-400" />}
                            </div>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
