import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useConference } from '../lib/store.jsx';
import { UserSwitcher } from './UserSwitcher.jsx';
import { RouteChange } from './RouteChange.jsx';
import { ConflictDialog } from './ConflictDialog.jsx';
import { Icon } from './Icon.jsx';
import { cx } from './ui.jsx';
import { useTheme } from '../lib/theme.js';

const NAV = [
  { to: '/', label: 'Home', icon: 'sparkle', end: true },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/speakers', label: 'Speakers', icon: 'users' },
  { to: '/my-agenda', label: 'My Agenda', icon: 'ticket' },
  { to: '/venues', label: 'Venues', icon: 'building' },
  { to: '/food', label: 'Food', icon: 'food' },
  { to: '/expo', label: 'Expo', icon: 'grid' },
];

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-cyan-500 text-base shadow-lg shadow-violet-900/40">
        🛰️
      </span>
      <span className="leading-none">
        <span className="block font-display text-xl tracking-tight">ORBIT</span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.22em] text-faint">Las Vegas ’26</span>
      </span>
    </NavLink>
  );
}

const THEMES = [
  { choice: 'light', label: 'Light', icon: 'sun' },
  { choice: 'dark', label: 'Dark', icon: 'moon' },
  { choice: 'system', label: 'System', icon: 'monitor' },
];

/** Light / Dark / System, as one segmented control. */
function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-0.5 rounded-full border border-hairline bg-raised/60 p-0.5">
      {THEMES.map((t) => (
        <button
          key={t.choice}
          type="button"
          onClick={() => setChoice(t.choice)}
          aria-pressed={choice === t.choice}
          aria-label={t.label}
          title={t.label}
          data-testid={`theme-${t.choice}`}
          className={cx(
            'grid size-7 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 sm:size-8',
            choice === t.choice ? 'bg-overlay text-ink' : 'text-faint hover:text-ink',
          )}
        >
          <Icon name={t.icon} className="size-4" />
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { ready, reservations, conflict, resolveConflict, conference } = useConference();
  const [menuOpen, setMenuOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <RouteChange />
      <ConflictDialog
        conflict={conflict}
        onSwap={async () => {
          setSwapping(true);
          try { await resolveConflict(true); } finally { setSwapping(false); }
        }}
        onCancel={() => resolveConflict(false)}
        busy={swapping}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <header className="glass sticky top-0 z-40 border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />

          <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx(
                  'relative rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {item.to === '/my-agenda' && reservations.size > 0 && (
                      <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-px text-[10px] font-bold text-emerald-300">
                        {reservations.size}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <ThemeToggle />
            {ready && <UserSwitcher />}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="grid size-9 place-items-center rounded-lg border border-hairline bg-raised/60 text-muted transition-colors hover:text-ink lg:hidden"
            >
              <Icon name={menuOpen ? 'close' : 'menu'} className="size-4.5" />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="Mobile" className="animate-rise border-t border-hairline bg-surface/95 px-4 py-3 lg:hidden">
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cx(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-violet-500/12 text-violet-200' : 'text-muted hover:bg-raised hover:text-ink',
                    )}
                  >
                    <Icon name={item.icon} className="size-4" />
                    {item.label}
                    {item.to === '/my-agenda' && reservations.size > 0 && (
                      <span className="ml-auto text-[11px] font-bold text-emerald-300">{reservations.size}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-hairline">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
            <div>
              <span className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-violet-600 to-cyan-500 text-sm">
                  🛰️
                </span>
                <span className="font-display text-lg tracking-tight">ORBIT ’26</span>
              </span>
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
                The Applied AI Conference. Four days of engineers who actually shipped it.
              </p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                {conference?.dates} · {conference?.city}
              </p>
            </div>

            {[
              {
                title: 'Programme',
                links: [
                  ['Schedule', '/schedule'],
                  ['Speakers', '/speakers'],
                  ['My agenda', '/my-agenda'],
                ],
              },
              {
                title: 'On site',
                links: [
                  ['Venues & stages', '/venues'],
                  ['Getting between sites', '/venues'],
                  ['Food & drink', '/food'],
                ],
              },
              {
                title: 'Conference',
                links: [
                  ['Partners & sponsors', '/expo'],
                  ['Code of conduct', '/code-of-conduct'],
                  ['Accessibility', '/accessibility'],
                ],
              },
            ].map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">{col.title}</h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map(([label, to]) => (
                    <li key={label}>
                      <NavLink to={to} className="text-[13px] text-muted transition-colors hover:text-ink">
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-hairline pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>Aurora Convention Center &amp; The Foundry at Red Rock Yards</p>
            <p className="font-mono">
              Sessions and speaker data are open —{' '}
              <a href="/api/bootstrap" className="underline underline-offset-2 transition-colors hover:text-ink">
                /api
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
