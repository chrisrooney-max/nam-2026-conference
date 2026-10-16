import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { plural, relativeDate, shortDay, time as fmtTime } from '../lib/format.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { LiveNow } from '../components/LiveNow.jsx';
import { TodayPanel } from '../components/TodayPanel.jsx';
import { SponsorMarquee } from '../components/SponsorMarquee.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { HeroMedia } from '../components/HeroMedia.jsx';
import { Avatar, Button, Chip, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * A slim bar, not a brochure.
 *
 * The page used to open with a marketing headline, four vanity stats and a
 * "programme at a glance" panel — 592px desktop and over a full screen on a
 * phone, none of it about the person holding the phone, all of it known before
 * they bought a ticket.
 */
function HeroBar({ conference }) {
  const { clock, days } = useConference();
  const today = days.find((d) => d.date === clock.day);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline" data-testid="hero">
      <HeroMedia />
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none tracking-tight sm:text-3xl">
            {conference.name} <span className="text-muted">{conference.edition}</span>
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {conference.dates} · {conference.city}
          </p>
        </div>

        {today && (
          <Chip accent="cyan" className="!py-1.5">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-cyan-400" />
            {today.label} · {fmtTime(clock.time)}
          </Chip>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button to={`/schedule?day=${clock.day}`} variant="primary" size="sm">
            Browse today <Icon name="arrowRight" className="size-3.5" />
          </Button>
          <Button to="/my-agenda" size="sm">My agenda</Button>
        </div>
      </div>
    </section>
  );
}

/** Speakers check their seat count obsessively. Give them it. */
function SpeakingStrip() {
  const { currentUser } = useConference();
  const { data } = useFetch(() => api.getUser(currentUser.id), [currentUser.id]);
  if (!currentUser.isSpeaker || !data?.speakingSessions?.length) return null;

  const sessions = data.speakingSessions;
  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5 sm:p-6"
      data-testid="speaking-strip">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={data.speaker.name} initials={data.speaker.initials}
          accent={data.speaker.accent} imageUrl={data.speaker.imageUrl} size="md" />
        <div>
          <Chip accent="violet" className="!py-0.5 !text-[10px]">
            <Icon name="mic" className="size-3" /> You are on stage
          </Chip>
          <h2 className="mt-1 font-display text-lg leading-tight">
            {plural(sessions.length, 'session')} on your programme
          </h2>
        </div>
        <Button to="/my-agenda" size="sm" className="ml-auto">Speaker view</Button>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.slice(0, 3).map((s) => {
          const pct = Math.round(s.fillRate * 100);
          return (
            <li key={s.id}>
              <Link to={`/sessions/${s.id}`}
                className="block rounded-xl border border-hairline bg-surface p-3 transition-colors hover:border-ink/20">
                <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                  <span className="text-muted">{shortDay(s.day)} · {fmtTime(s.startsAt)}</span>
                  <span className="text-ink">{s.seatsTaken}/{s.capacity}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug">{s.title}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-overlay">
                  <div className={cx('h-full rounded-full',
                    pct >= 95 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400')}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One announcement, and only one that has actually been posted.
 *
 * This used to render the first two pinned rows regardless of `postedAt`, so a
 * warning about day 3 appeared on day 2 — before it was written.
 */
function LatestAnnouncement() {
  const { clock, venueById } = useConference();
  const { data } = useFetch(api.getAnnouncements, []);

  const nowIso = `${clock.day}T${clock.time}:00Z`;
  const live = (data ?? [])
    .filter((a) => a.postedAt <= nowIso)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.localeCompare(a.postedAt));

  const item = live[0];
  if (!item) return null;

  const tone = {
    warning: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
    success: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
    info: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200',
  }[item.kind] ?? 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200';

  return (
    <section className={cx('flex gap-3 rounded-2xl border p-4', tone)} data-testid="announcements">
      <Icon name={item.kind === 'warning' ? 'alert' : 'info'} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <span className="text-[11px] text-faint">
            {relativeDate(item.postedAt, clock)}
            {item.venueId && ` · ${venueById[item.venueId]?.shortName}`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
      </div>
    </section>
  );
}

function FromSpeakersYouFollow() {
  const { currentUser, followingIds } = useConference();
  const { data, loading } = useFetch(
    () => api.getFollowedSessions(currentUser.id),
    [currentUser.id, followingIds.size],
  );
  const sessions = (data ?? []).slice(0, 3);
  if (!loading && sessions.length === 0) return null;

  return (
    <section data-testid="followed-sessions">
      <SectionHeader
        eyebrow={`${plural(followingIds.size, 'speaker')} followed`}
        title="From speakers you follow"
        action={<Button to="/speakers?show=following" size="sm">
          Manage <Icon name="chevronRight" className="size-3.5" />
        </Button>}
      />
      <div className="mt-6 grid grid-flow-row-dense grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
        {loading
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-64" />)
          : sessions.map((s) => <SessionCard key={s.id} session={s} showDay />)}
      </div>
    </section>
  );
}

export function HomePage() {
  const { conference } = useConference();
  useDocumentTitle("ORBIT '26");

  return (
    // Sections hide themselves when empty; hide their Reveal wrapper too, or
    // each one leaves a blank gap in the stack.
    <div className="space-y-8 [&>:empty]:hidden">
      <HeroBar conference={conference} />
      <LiveNow />
      <Reveal><TodayPanel /></Reveal>
      <Reveal><SpeakingStrip /></Reveal>
      <Reveal><LatestAnnouncement /></Reveal>
      <Reveal><FromSpeakersYouFollow /></Reveal>
      <SponsorMarquee />
    </div>
  );
}
