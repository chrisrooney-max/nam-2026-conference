import { Link } from 'react-router-dom';
import { useConference } from '../lib/store.jsx';
import { accent } from '../lib/accents.js';
import { plural, time as fmtTime } from '../lib/format.js';
import { toMinutes, relativeToNow } from '../lib/clock.js';
import { Chip, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { LiveBadge } from './LiveNow.jsx';

function Row({ session, live, clock }) {
  const a = accent(session.track.color);
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="group relative flex min-w-0 flex-1 items-start gap-3 overflow-hidden rounded-xl border border-hairline bg-raised p-4 transition-colors hover:border-ink/20 hover:bg-overlay/70"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} />
      <div className="min-w-0 flex-1 pl-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {live ? <LiveBadge /> : (
            <Chip accent="cyan" className="!py-0.5 !text-[10px]">
              <Icon name="clock" className="size-3" />
              {relativeToNow(session.startsAt, clock.time)}
            </Chip>
          )}
          <span className="font-mono text-[11px] text-muted">
            {fmtTime(session.startsAt)}
            {live && ` · ends ${relativeToNow(session.endsAt, clock.time)}`}
          </span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-violet-200">
          {session.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" className="size-3 text-faint" />
            {session.room.name}
          </span>
          {!session.venue.isPrimary && (
            <span className="font-semibold text-orange-300">· {session.venue.shortName}</span>
          )}
          <span className="text-faint">· ~{session.room.walkMinutes} min walk</span>
        </p>
      </div>
    </Link>
  );
}

/**
 * "What am I doing right now, and what is next?" — the most-asked question of
 * any conference app, and the one My Agenda could not answer. Reads the
 * attendee's own booked sessions against the conference clock.
 */
export function NextUpCard({ days }) {
  const { clock } = useConference();

  const today = days.find((d) => d.date === clock.day);
  if (!today) return null;

  const now = toMinutes(clock.time);
  const sessions = [...today.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = sessions.find((s) => now >= toMinutes(s.startsAt) && now < toMinutes(s.endsAt));
  const next = sessions.find((s) => toMinutes(s.startsAt) > now);
  const done = sessions.filter((s) => now >= toMinutes(s.endsAt)).length;

  if (!current && !next) {
    return (
      <div className="card flex items-center gap-3 p-5" data-testid="next-up">
        <Icon name="check" className="size-5 shrink-0 text-emerald-400" />
        <p className="text-[13px] text-muted">
          {done > 0
            ? `That is your day — ${plural(done, 'session')} done. Nothing else booked today.`
            : 'Nothing booked today.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="next-up">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg">Right now</h2>
        <span className="font-mono text-[11px] text-faint">{fmtTime(clock.time)}</span>
        {done > 0 && <span className="text-[11px] text-faint">· {done} done today</span>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {current
          ? <Row session={current} live clock={clock} />
          : (
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-dashed border-hairline p-4 text-[13px] text-muted">
              <Icon name="clock" className="size-4 shrink-0 text-faint" />
              Nothing on right now.
            </div>
          )}
        {next && <Row session={next} clock={clock} />}
      </div>

      {current && next && toMinutes(next.startsAt) - toMinutes(current.endsAt) <= 30
        && current.venue.id !== next.venue.id && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[12px] text-amber-200">
          <Icon name="car" className="size-3.5 shrink-0" />
          These are at different sites, {toMinutes(next.startsAt) - toMinutes(current.endsAt)} minutes apart.
        </p>
      )}
    </div>
  );
}
