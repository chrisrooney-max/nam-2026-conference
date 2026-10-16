import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { plural } from '../lib/format.js';
import { Chip, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { GeneratedCover } from '../components/GeneratedCover.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

const TIERS = ['Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'];

/** Tier drives size, artwork and how much copy survives. */
const TIER_STYLE = {
  Diamond:  { cols: 'sm:grid-cols-2', mark: 'size-16', pad: 'p-6', title: 'font-display text-2xl', banner: true, blurb: true },
  Platinum: { cols: 'sm:grid-cols-3', mark: 'size-14', pad: 'p-5', title: 'font-display text-lg', banner: true, blurb: true },
  Gold:     { cols: 'sm:grid-cols-3 lg:grid-cols-5', mark: 'size-11', pad: 'p-4', title: 'text-[15px] font-semibold leading-tight', blurb: true },
  Silver:   { cols: 'sm:grid-cols-3 lg:grid-cols-4', mark: 'size-9', pad: 'p-3.5', title: 'text-sm font-semibold leading-tight' },
  Bronze:   { cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', mark: 'size-8', pad: 'p-3', title: 'text-[13px] font-semibold leading-tight' },
};

function SponsorCard({ sponsor, style, venue }) {
  return (
    // Sponsors are fictional, so this is a card rather than a link to a made-up
    // domain. Booth number is the useful thing anyway.
    <div
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-xl border border-hairline bg-raised transition-colors',
        'hover:border-ink/20 hover:bg-overlay/70',
      )}
    >
      {style.banner && (
        <div className="relative h-16 overflow-hidden">
          <GeneratedCover seed={sponsor.name} accent={sponsor.accent} variant="strata"
            className="size-full transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/50 to-transparent" />
        </div>
      )}

      <div className={cx('flex flex-1 flex-col', style.pad, style.banner && '-mt-7 pt-0')}>
        <div className="flex items-start gap-3">
          <GeneratedCover
            seed={sponsor.name}
            accent={sponsor.accent}
            variant="mark"
            className={cx('shrink-0 rounded-xl', style.mark, style.banner ? 'ring-4 ring-raised' : 'ring-1 ring-ink/10')}
          />
          <div className={cx('min-w-0 flex-1', style.banner && 'pt-8')}>
            {/* Names wrap rather than truncate — "Blackbird S…" helps nobody. */}
            <h3 className={cx('group-hover:text-violet-200', style.title)}>{sponsor.name}</h3>
            <p className="mt-0.5 text-[11px] text-faint">
              Booth {sponsor.booth} · {venue?.shortName}
            </p>
          </div>
          <span className="shrink-0 rounded bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-faint">
            {sponsor.booth}
          </span>
        </div>

        {style.blurb && <p className="mt-3 text-[13px] leading-relaxed text-muted">{sponsor.blurb}</p>}

        {(sponsor.perk || sponsor.hiring) && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {sponsor.perk && <Chip accent={sponsor.accent} className="!px-2 !py-0.5 !text-[10px]">{sponsor.perk}</Chip>}
            {sponsor.hiring && <Chip accent="emerald" className="!px-2 !py-0.5 !text-[10px]">Hiring</Chip>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpoPage() {
  useDocumentTitle('Partners & sponsors');
  const { venueById } = useConference();
  const { data, loading, error, reload } = useFetch(api.getSponsors, []);
  const sponsors = data ?? [];
  const hiring = sponsors.filter((s) => s.hiring).length;

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Expo hall"
        title="Partners &amp; sponsors"
        description={`${sponsors.length || '—'} companies, most of them with something you can actually try at the booth. ${hiring} are hiring.`}
      />

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div>}

      {TIERS.map((tier) => {
        const tierSponsors = sponsors.filter((s) => s.tier === tier);
        if (!tierSponsors.length) return null;
        const style = TIER_STYLE[tier];
        return (
          <section key={tier} data-testid={`tier-${tier.toLowerCase()}`}>
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-faint">{tier}</h2>
              <span className="h-px flex-1 bg-hairline" />
              <span className="text-[11px] text-faint">{plural(tierSponsors.length, 'partner')}</span>
            </div>
            <div className={cx('stagger grid gap-3', style.cols)}>
              {tierSponsors.map((s) => (
                <SponsorCard key={s.id} sponsor={s} style={style} venue={venueById[s.venueId]} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
