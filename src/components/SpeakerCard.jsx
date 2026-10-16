import { Link } from 'react-router-dom';
import { useConference } from '../lib/store.jsx';
import { Avatar, Chip, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * Two densities, because a hundred-plus speakers cannot all be equally important
 * (the headliners get SpeakerSpotlight instead):
 *   "grid"    — the default card
 *   "compact" — a name-index line for the long tail
 */
export function SpeakerCard({ speaker, variant = 'grid' }) {
  const { isFollowing } = useConference();
  const following = isFollowing(speaker.id);
  const sessionCount = speaker.sessionCount ?? speaker.sessions?.length ?? 0;

  /**
   * The long tail. Ninety-odd people, so this is a name index, not a profile
   * list — title, company and city all truncated to nothing at this width and
   * only added height. They are one tap away on the profile.
   */
  if (variant === 'compact') {
    return (
      <Link
        to={`/speakers/${speaker.id}`}
        title={`${speaker.name} — ${speaker.jobTitle}, ${speaker.company}`}
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
      >
        <Avatar name={speaker.name} initials={speaker.initials} accent={speaker.accent}
          imageUrl={speaker.imageUrl} size="xs" ring={false} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium group-hover:text-violet-200">
          {speaker.name}
        </span>
        {following && <Icon name="check" className="size-3 shrink-0 text-emerald-400" />}
        {sessionCount > 1 && (
          <span className="shrink-0 font-mono text-[10px] text-faint">{sessionCount}</span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={`/speakers/${speaker.id}`}
      className={cx(
        'group relative flex flex-col items-center gap-3 rounded-xl border border-hairline bg-raised p-5 text-center',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:bg-overlay/70',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
      )}
    >
      {following && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          <Icon name="check" className="size-2.5" />Following
        </span>
      )}
      {(speaker.keynoteCount > 0 || speaker.featured) && (
        <span className="absolute right-3 top-3 rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
          {speaker.keynoteCount > 0 ? 'Keynote' : 'Featured'}
        </span>
      )}
      <Avatar name={speaker.name} initials={speaker.initials} accent={speaker.accent}
        imageUrl={speaker.imageUrl} size="lg" />
      <div className="min-w-0">
        <h3 className="truncate font-semibold leading-tight transition-colors group-hover:text-violet-200">
          {speaker.name}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{speaker.jobTitle}</p>
        <p className="line-clamp-1 text-xs font-medium text-faint">{speaker.company}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-center gap-1.5">
        {speaker.expertise.slice(0, 2).map((e) => (
          <Chip key={e} className="!px-2 !py-0.5 !text-[10px]">{e}</Chip>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1"><Icon name="mic" className="size-3" />{sessionCount}</span>
        <span className="inline-flex items-center gap-1"><Icon name="globe" className="size-3" />{speaker.city}</span>
      </div>
    </Link>
  );
}
