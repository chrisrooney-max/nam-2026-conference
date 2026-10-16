import { useSearchParams } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { routesBetween } from '../lib/travel.js';
import { Chip, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { VenueRouteMap } from '../components/VenueRouteMap.jsx';
import { VenueBoard } from '../components/VenueBoard.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

function TravelPanel({ venueData }) {
  const { venues, travel, rooms } = useConference();
  const [from, to] = venues;
  if (!from || !to) return null;
  const options = routesBetween(travel, from.id, to.id);
  const withCounts = venues.map((v) => ({
    ...v,
    roomCount: (venueData ?? []).find((x) => x.id === v.id)?.rooms.length
      ?? rooms.filter((r) => r.venueId === v.id).length,
  }));

  return (
    <section className="card overflow-hidden" data-testid="travel-panel">
      <div className="border-b border-hairline p-6 sm:p-8 sm:pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Icon name="car" className="size-5 text-amber-300" />
          <h2 className="font-display text-2xl">Getting between the two sites</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {from.shortName} and {to.shortName} are 6.2 miles apart. A session at one and a session at the other
          in adjacent slots is not a plan — it is a wish.
        </p>
      </div>

      <VenueRouteMap venues={withCounts} routes={options} className="!rounded-none !border-x-0 !border-t-0" />

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        {options.map((o) => (
          <div key={o.mode} className={cx(
            'rounded-2xl border p-4',
            o.mode === 'Walk' ? 'border-hairline bg-raised/30 opacity-60' : 'border-hairline bg-surface/70',
          )}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{o.mode}</h3>
              <span className="text-[11px] text-faint">{o.costUsd ? `$${o.costUsd.toFixed(2)}` : 'Free'}</span>
            </div>
            <div className="mt-1.5 font-display text-3xl leading-none">
              {o.minutes}<span className="text-sm text-muted"> min</span>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{o.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function VenueFacts({ venue }) {
  const a = accent(venue.accent);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface p-6 sm:p-7">
      <span className={cx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', a.grad)} />
      <div className="flex flex-wrap items-start gap-4">
        <span className="text-3xl" aria-hidden="true">{venue.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl leading-tight">{venue.name}</h2>
            {venue.isPrimary && <Chip accent={venue.accent}>Main site</Chip>}
          </div>
          <p className="mt-1 text-sm text-muted">{venue.address} · {venue.city}</p>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">{venue.description}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 border-l border-t border-ink/[0.08] sm:grid-cols-5">
        {[
          [venue.rooms.length, 'Stages'],
          [venue.sessionCount, 'Sessions'],
          [venue.vendorCount, 'Food'],
          [`${venue.opensAt}–${venue.closesAt}`, 'Open'],
          [venue.wifiSsid, 'Wifi'],
        ].map(([value, label]) => (
          <div key={label} className="border-b border-r border-ink/[0.08] px-3 py-2.5">
            <dt className="sr-only">{label}</dt>
            <dd>
              <span className="block truncate font-display text-lg leading-none">{value}</span>
              <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function VenuesPage() {
  useDocumentTitle('Venues & stages');
  const { days, clock } = useConference();
  const { data, loading, error } = useFetch(api.getVenues, []);
  const [params, setParams] = useSearchParams();

  const venues = data ?? [];
  const stageCount = venues.reduce((n, v) => n + v.rooms.length, 0);

  const selectedId = Number(params.get('venue')) || venues[0]?.id;
  const selected = venues.find((v) => v.id === selectedId) ?? venues[0];
  const day = params.get('day') ?? clock.day ?? days[0]?.date;

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Where to go"
        title="Venues &amp; stages"
        description={`${stageCount || '—'} stages across two sites. Check which one a session is at before you commit your morning to it.`}
      />

      <TravelPanel venueData={data} />

      {loading && <Skeleton className="h-96" />}
      {error && <p className="text-sm text-rose-300">{error.message}</p>}

      {selected && (
        <section className="space-y-5">
          {/* venue switcher */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Choose a venue">
            {venues.map((v) => {
              const active = v.id === selected.id;
              const a = accent(v.accent);
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => set('venue', v.id)}
                  data-testid={`venue-tab-${v.id}`}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                    active ? a.chip : 'border-hairline bg-surface text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  <span aria-hidden="true">{v.emoji}</span>
                  {v.shortName}
                  <span className="font-mono text-[11px] opacity-60">{v.rooms.length}</span>
                </button>
              );
            })}

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => set('day', d.date)}
                  aria-pressed={d.date === day}
                  className={cx(
                    'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                    d.date === day
                      ? 'border-violet-400/50 bg-violet-500/15 text-ink'
                      : 'border-hairline bg-surface text-muted hover:text-ink',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <VenueFacts venue={selected} />
          <VenueBoard venue={selected} day={day} />
        </section>
      )}
    </div>
  );
}
