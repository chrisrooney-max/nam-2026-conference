import { accentHex } from '../lib/accents.js';
import { cx } from './ui.jsx';

/**
 * The two-site map.
 *
 * The most important fact in this product is that ORBIT happens in two places
 * six miles apart. Positions come from the real lat/lng on each venue row,
 * projected onto the canvas, so the geometry is honest rather than decorative.
 */
const W = 900;
const H = 290;
const PAD_X = 140;
const SPREAD_Y = 90;

/** Project lat/lng onto the canvas, centred on both axes so there is no dead band. */
function project(venues) {
  const lats = venues.map((v) => v.lat);
  const lngs = venues.map((v) => v.lng);
  const minLng = Math.min(...lngs);
  const minLat = Math.min(...lats);
  const spanLng = Math.max(...lngs) - minLng || 1;
  const spanLat = Math.max(...lats) - minLat || 1;

  return venues.map((v) => ({
    ...v,
    x: PAD_X + ((v.lng - minLng) / spanLng) * (W - PAD_X * 2),
    // north is up, and the band is centred vertically
    y: H / 2 + SPREAD_Y / 2 - ((v.lat - minLat) / spanLat) * SPREAD_Y,
  }));
}

export function VenueRouteMap({ venues, routes, className }) {
  if (venues.length < 2) return null;
  const points = project(venues);
  const [a, b] = points;

  // A gentle arc rather than a straight line — reads as a journey, not a rule.
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2 - 52;
  const path = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
  const fastest = routes.filter((r) => r.mode !== 'Walk').sort((x, y) => x.minutes - y.minutes)[0];

  return (
    <div className={cx('relative overflow-hidden rounded-xl border border-hairline bg-ground', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Map showing ${a.name} and ${b.name}, ${fastest?.minutes} minutes apart by ${fastest?.mode}`}>
        <defs>
          <pattern id="streets" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0H0v60" fill="none" stroke="var(--color-ink)" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={accentHex(a.accent)[0]} />
            <stop offset="100%" stopColor={accentHex(b.accent)[0]} />
          </linearGradient>
        </defs>

        <rect width={W} height={H} fill="url(#streets)" />
        {/* a couple of arterial roads for context */}
        <path d={`M0 ${H * 0.78} H${W}`} stroke="var(--color-ink)" strokeOpacity="0.07" strokeWidth="10" />
        <path d={`M${W * 0.63} 0 V${H}`} stroke="var(--color-ink)" strokeOpacity="0.055" strokeWidth="7" />

        {/* the route */}
        <path d={path} fill="none" stroke="url(#routeGrad)" strokeWidth="2.5"
          strokeDasharray="9 7" strokeLinecap="round" opacity="0.9" />

        {/* distance marker riding the arc */}
        <g transform={`translate(${midX}, ${midY + 34})`}>
          <rect x="-62" y="-17" width="124" height="34" rx="17" fill="var(--color-ground)" stroke="var(--color-hairline)" />
          <text x="0" y="-1" textAnchor="middle" className="fill-ink text-[13px] font-bold">6.2 miles</text>
          <text x="0" y="11" textAnchor="middle" className="fill-ink/45 text-[10px]">
            {fastest ? `${fastest.minutes} min by ${fastest.mode.toLowerCase()}` : ''}
          </text>
        </g>

        {points.map((v) => {
          const [light] = accentHex(v.accent);
          return (
            <g key={v.id} transform={`translate(${v.x}, ${v.y})`}>
              <circle r="30" fill={light} opacity="0.12" />
              <circle r="17" fill={light} opacity="0.22" />
              <circle r="8" fill={light} />
              <circle r="3" fill="var(--color-ground)" />
              <text y="-44" textAnchor="middle" className="fill-ink text-[15px] font-bold">{v.shortName}</text>
              <text y="-28" textAnchor="middle" className="fill-ink/45 text-[11px]">
                {v.roomCount} stages · {v.city.split(',')[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
