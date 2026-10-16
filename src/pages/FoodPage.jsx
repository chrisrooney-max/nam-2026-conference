import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent, accentFor } from '../lib/accents.js';
import { plural, time } from '../lib/format.js';
import { isOpenAt } from '../lib/clock.js';
import { GeneratedCover } from '../components/GeneratedCover.jsx';
import { SearchInput, Select } from '../components/FilterBar.jsx';
import { Button, Chip, EmptyState, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

const ALL = 'all';

function WaitBadge({ mins, open }) {
  if (!open) return <Chip className="!py-0.5 !text-[10px] opacity-70">Closed now</Chip>;
  if (!mins) return <Chip accent="emerald" className="!py-0.5 !text-[10px]">No queue</Chip>;
  const tone = mins >= 25 ? 'rose' : mins >= 15 ? 'amber' : 'emerald';
  return (
    <Chip accent={tone} className="!py-0.5 !text-[10px]">
      <Icon name="clock" className="size-3" />{mins} min
    </Chip>
  );
}

function VendorCard({ vendor, venue, now, featured }) {
  const a = accent(venue?.accent ?? 'violet');
  // Colour the artwork by cuisine so the grid reads as a varied food hall,
  // not twenty tiles of the same purple.
  const art = accentFor(vendor.cuisine);
  const open = isOpenAt(vendor.opensAt, vendor.closesAt, now);

  return (
    <article
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-raised transition-colors',
        'hover:border-ink/20 hover:bg-overlay/70',
        featured ? 'border-amber-400/30 sm:col-span-2' : 'border-hairline',
        !open && 'opacity-70',
      )}
    >
      {/* Generated artwork stands in for food photography. */}
      <div className={cx('relative overflow-hidden', featured ? 'h-24' : 'h-16')}>
        <GeneratedCover seed={vendor.name} accent={art} variant="mesh"
          className="size-full transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/40 to-transparent" />
        <span className={cx(
          'absolute left-4 grid place-items-center rounded-2xl bg-raised/85 backdrop-blur-sm ring-1 ring-ink/10',
          featured ? '-bottom-5 size-16 text-4xl' : '-bottom-4 size-12 text-2xl',
        )} aria-hidden="true">
          {vendor.emoji}
        </span>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {featured && <Chip accent="amber" className="!py-0.5 !text-[10px] !bg-black/50 backdrop-blur-sm">Top rated</Chip>}
          {open && <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 backdrop-blur-sm">Open</span>}
        </div>
      </div>

      <div className={cx('flex flex-1 flex-col p-4', featured ? 'pt-8' : 'pt-6')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={cx('truncate font-display leading-tight', featured ? 'text-xl' : 'text-base')}>
              {vendor.name}
            </h3>
            <p className="text-xs text-muted">{vendor.cuisine} · {vendor.priceTier}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className={cx('inline-flex items-center gap-1 font-semibold', featured ? 'text-lg' : 'text-sm')}>
              <Icon name="star" filled className="size-3.5 text-amber-400" />
              {vendor.rating.toFixed(1)}
            </div>
            <div className="text-[10px] text-faint">{vendor.reviewCount} reviews</div>
          </div>
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{vendor.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {vendor.dietary.map((d) => (
            <Chip key={d} accent="emerald" className="!px-2 !py-0.5 !text-[10px]">{d}</Chip>
          ))}
          {vendor.acceptsMealCredit && (
            <Chip className="!px-2 !py-0.5 !text-[10px]">
              <Icon name="ticket" className="size-3" />Meal credit
            </Chip>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-3 text-[11px] text-muted">
          <span className={cx('inline-flex items-center gap-1 font-medium', a.text)}>
            <Icon name="pin" className="size-3" />{venue?.shortName}
          </span>
          <span className="text-faint">{vendor.building} · {vendor.floor}</span>
          <span className="inline-flex items-center gap-1 text-faint">
            <Icon name="clock" className="size-3" />{time(vendor.opensAt)}–{time(vendor.closesAt)}
          </span>
          <span className="ml-auto"><WaitBadge mins={vendor.waitMins} open={open} /></span>
        </div>
      </div>
    </article>
  );
}

export function FoodPage() {
  useDocumentTitle('Food & drink');
  const { venues, venueById, cuisines = [], clock } = useConference();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const venue = params.get('venue') ?? ALL;
  const dietary = params.get('dietary') ?? ALL;
  const cuisine = params.get('cuisine') ?? ALL;
  const sort = params.get('sort') ?? 'rating';
  const openNow = params.get('open') === '1';

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const { data, loading, error, reload } = useFetch(
    () => api.getVendors({ q, venueId: venue, dietary, cuisine }),
    [q, venue, dietary, cuisine],
  );

  const vendors = useMemo(() => {
    let list = [...(data ?? [])];
    if (openNow) list = list.filter((v) => isOpenAt(v.opensAt, v.closesAt, clock.time));
    if (sort === 'wait') list.sort((a, b) => a.waitMins - b.waitMins);
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [data, sort, openNow, clock.time]);

  const openCount = (data ?? []).filter((v) => isOpenAt(v.opensAt, v.closesAt, clock.time)).length;
  const topVendorId = sort === 'rating' ? vendors[0]?.id : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Eat something"
        title="Food &amp; drink"
        description={`${data?.length ?? '—'} vendors across both sites. ${openCount} open right now at ${time(clock.time)}.`}
      />

      <div className="card space-y-3 p-3 sm:p-4" data-testid="food-filters">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Search food…"
            className="lg:col-span-2" data-testid="food-search" />
          <Select label="Cuisine" value={cuisine} onChange={(v) => set('cuisine', v)}
            options={[{ value: ALL, label: `All ${cuisines.length} cuisines` },
              ...cuisines.map((c) => ({ value: c, label: c }))]} />
          <Select label="Venue" value={venue} onChange={(v) => set('venue', v)}
            options={[{ value: ALL, label: 'Both venues' }, ...venues.map((v) => ({ value: String(v.id), label: v.shortName }))]} />
          <Select label="Dietary" value={dietary} onChange={(v) => set('dietary', v)}
            options={[
              { value: ALL, label: 'Any dietary' },
              { value: 'vegan', label: 'Vegan options' },
              { value: 'vegetarian', label: 'Vegetarian options' },
              { value: 'gluten-free', label: 'Gluten-free options' },
            ]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => set('open', openNow ? null : '1')}
              aria-pressed={openNow}
              data-testid="open-now-toggle"
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                openNow
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-hairline bg-ground/70 text-muted hover:text-ink',
              )}
            >
              <span className={cx('size-1.5 rounded-full', openNow ? 'bg-emerald-400 animate-pulse-dot' : 'bg-faint')} />
              Open now
            </button>
            <Select label="Sort" value={sort} onChange={(v) => set('sort', v)}
              options={[
                { value: 'rating', label: 'Highest rated' },
                { value: 'wait', label: 'Shortest wait' },
                { value: 'name', label: 'A–Z' },
              ]} className="w-40" />
          </div>
          <p className="text-xs text-muted" data-testid="vendor-count">
            {loading ? 'Loading…' : plural(vendors.length, 'vendor')}
          </p>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : !error && vendors.length === 0 ? (
        <EmptyState
          icon="food"
          title="Nothing matches"
          description="Try a different cuisine, or turn off “open now”."
          action={<Button size="sm" onClick={() => setParams(new URLSearchParams())}>Clear filters</Button>}
        />
      ) : (
        <div className="stagger grid grid-flow-row-dense gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vendors.map((v, i) => (
            <div key={v.id} style={{ '--i': Math.min(i, 12) }} className="contents">
              <VendorCard vendor={v} venue={venueById[v.venueId]} now={clock.time}
                featured={v.id === topVendorId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
