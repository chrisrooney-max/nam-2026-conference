import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConference } from '../lib/store.jsx';
import { useToast } from './Toaster.jsx';
import { Button, cx } from './ui.jsx';

/**
 * The signed-in attendee's interests: every topic tag as a toggle, their
 * current ones on. Save stores the set; Cancel, Escape and the backdrop close
 * without saving; `onClose(true)` says it was saved. Portalled because it opens from the header, which is `glass`
 * and would otherwise be the containing block for `fixed`.
 */
function Panel({ onClose }) {
  const { tags = [], currentUser, saveInterests } = useConference();
  const toast = useToast();
  const topics = tags.filter((t) => t.kind === 'topic');
  const [chosen, setChosen] = useState(() => new Set(currentUser?.interests ?? []));
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  // The parent passes a fresh handler each render; read it through a ref so the
  // effect below runs once per open.
  const closeRef = useRef(onClose);
  closeRef.current = busy ? () => {} : onClose;

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const toggle = (name) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const save = async () => {
    setBusy(true);
    try {
      await saveInterests(topics.filter((t) => chosen.has(t.name)).map((t) => t.name));
      onClose(true);
    } catch (err) {
      toast({ message: `Could not save: ${err.message}`, icon: 'alert' });
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interests-title"
      data-testid="interests-dialog"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={ref}
        tabIndex={-1}
        className="glass relative flex max-h-[85dvh] w-full max-w-lg animate-rise flex-col rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl"
      >
        <h2 id="interests-title" className="font-display text-xl leading-tight">Your interests</h2>
        <p className="mt-1 text-[13px] text-muted">Pick the topics you care about.</p>

        <div className="-mx-1 mt-4 flex-1 overflow-y-auto px-1">
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => {
              const on = chosen.has(t.name);
              return (
                <button
                  key={t.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t.name)}
                  data-testid={`interest-${t.slug}`}
                  className={cx(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
                    on
                      ? 'border-violet-400/50 bg-violet-500/20 text-violet-200'
                      : 'border-hairline bg-raised text-muted hover:bg-overlay',
                  )}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function InterestsDialog({ open, onClose }) {
  // Mounted only while open, so each opening starts from the stored interests.
  return open ? <Panel onClose={onClose} /> : null;
}
