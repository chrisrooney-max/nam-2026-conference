import { useEffect, useRef, useState } from 'react';
import { useConference } from '../lib/store.jsx';
import { Avatar, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * Attendee switcher. There is no auth — the app runs as whichever seeded
 * attendee is selected, and each has their own agenda and follows.
 */
export function UserSwitcher() {
  const { users = [], currentUser, setCurrentUserId, reservations } = useConference();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!currentUser) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        // The name is hidden on small screens, so the button needs its own label.
        aria-label={`Viewing as ${currentUser.name}. Switch attendee.`}
        className={cx(
          'flex items-center gap-2 rounded-full border border-dashed border-amber-400/60 bg-raised/60 py-1 pl-2 pr-2.5 transition-colors',
          'hover:border-amber-300 hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        )}
      >
        {/* Demo cues: there is no login, so this must not read as an account menu. */}
        <span className="whitespace-nowrap text-[9px] font-bold uppercase leading-none tracking-wide text-amber-300">Viewing as</span>
        <span className="rounded bg-amber-400/15 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide text-amber-300">Demo</span>
        <Avatar name={currentUser.name} initials={currentUser.initials} accent={currentUser.accent} imageUrl={currentUser.imageUrl} size="sm" />
        <span className="hidden text-xs font-semibold sm:block">{currentUser.name.split(' ')[0]}</span>
        <Icon name="chevronDown" className={cx('size-3.5 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="glass absolute right-0 top-full z-50 mt-2 w-[19rem] animate-rise overflow-hidden rounded-2xl border border-hairline shadow-2xl shadow-black/60"
        >
          <div className="border-b border-hairline px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Viewing as</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Each attendee has their own agenda, follows and interests.
            </p>
          </div>
          <ul className="max-h-[26rem] overflow-y-auto p-1.5">
            {users.map((u) => {
              const active = u.id === currentUser.id;
              // The store only ever holds live reservation state for the
              // signed-in attendee, so only their row can read it live; every
              // other row keeps the count `/bootstrap` gave it on load.
              const agendaCount = active
                ? Array.from(reservations.values()).filter((status) => status === 'confirmed').length
                : u.reservedCount ?? 0;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { setCurrentUserId(u.id); setOpen(false); }}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                      active ? 'bg-violet-500/12' : 'hover:bg-raised',
                    )}
                  >
                    <Avatar name={u.name} initials={u.initials} accent={u.accent} imageUrl={u.imageUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{u.name}</span>
                        {u.ticketTier !== 'Standard' && (
                          <span className="shrink-0 rounded bg-overlay px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-faint">
                            {u.ticketTier}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted">{u.jobTitle}</div>
                      <div className="truncate text-[11px] text-faint">
                        {u.company} · {agendaCount} on agenda
                      </div>
                    </div>
                    {active && <Icon name="check" className="size-4 shrink-0 text-violet-300" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
