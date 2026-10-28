import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConference } from '../lib/store.jsx';
import { Avatar, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { InterestsDialog } from './InterestsDialog.jsx';

/**
 * The workshop's hosts, who agreed to appear as themselves. Only they are
 * offered here, since three real people demo better than six invented ones.
 */
const HOST_COMPANY = 'Equal Experts';

/** The hosts' two talks, in the order they are given. */
const TALKS = [
  { to: '/product-presentation', title: 'The product harness', blurb: 'A conversation → a ticket' },
  { to: '/engineering-presentation', title: 'The engineering harness', blurb: 'A ticket → a pull request' },
];

/**
 * Attendee switcher. There is no auth — the app runs as whichever seeded
 * attendee is selected, and each has their own agenda and follows. The other
 * seeded attendees still exist (tests sign in as them through localStorage);
 * one only shows here while it is the one selected, so it can be switched away from.
 */
export function UserSwitcher() {
  const { users = [], currentUser, setCurrentUserId, reservations } = useConference();
  const choices = users.filter((u) => u.company === HOST_COMPANY || u.id === currentUser?.id);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Opened by the name tab because interests are empty, rather than from the link.
  const [prompting, setPrompting] = useState(false);
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

  // Stored interests decide this, so it survives a reload and follows the attendee.
  const needsInterests = !currentUser.interests?.length;
  const closeInterests = (saved) => {
    setEditing(false);
    // Skipping the prompt still leads to the menu; saving does not, and the next open will not prompt.
    if (prompting && saved !== true) setOpen(true);
    setPrompting(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!open && needsInterests) { setPrompting(true); setEditing(true); }
          else setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        // The name is hidden on small screens, so the button needs its own label.
        aria-label={`Viewing as ${currentUser.name}. Switch attendee.`}
        className={cx(
          'flex items-center gap-2 rounded-full border border-hairline bg-raised/60 py-1 pl-1 pr-2.5 transition-colors',
          'hover:border-white/15 hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        )}
      >
        <Avatar name={currentUser.name} initials={currentUser.initials} accent={currentUser.accent} imageUrl={currentUser.imageUrl} size="sm" />
        <span className="hidden text-xs font-semibold sm:block">{currentUser.name.split(' ')[0]}</span>
        <Icon name="chevronDown" className={cx('size-3.5 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {/* Outside `open &&` and the menu's ref: it is portalled, so the outside-pointerdown handler would unmount it mid-click. */}
      <InterestsDialog open={editing} onClose={closeInterests} />

      {open && (
        <div
          className="glass absolute right-0 top-full z-50 mt-2 w-[19rem] animate-rise overflow-hidden rounded-2xl border border-hairline shadow-2xl shadow-black/60"
        >
          <div className="border-b border-hairline px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Viewing as</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Each attendee has their own agenda, follows and interests.
            </p>
            <button
              type="button"
              onClick={() => { setOpen(false); setEditing(true); }}
              className="mt-1.5 text-[11px] font-semibold text-violet-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
              data-testid="edit-interests"
            >
              Edit interests
            </button>
          </div>
          <ul role="listbox" aria-label="Attendees" className="max-h-[26rem] overflow-y-auto p-1.5">
            {choices.map((u) => {
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
          {currentUser.isSpeaker && (
            <div className="border-t border-hairline p-1.5">
              <Link
                to={`/speakers/${currentUser.speakerId}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-raised"
                data-testid="own-speaker-profile"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-500/12 text-cyan-300">
                  <Icon name="mic" className="size-3" />
                </span>
                <span className="text-sm font-semibold">Your speaker profile</span>
              </Link>
            </div>
          )}
          <div className="border-t border-hairline p-1.5" data-testid="talk-links">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Workshop talks</p>
            {TALKS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-raised"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-300">
                  <Icon name="play" className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.title}</span>
                  <span className="block truncate text-[11px] text-faint">{t.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
