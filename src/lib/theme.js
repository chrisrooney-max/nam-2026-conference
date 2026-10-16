import { useEffect, useState } from 'react';

/**
 * Light / Dark / System. The attendee's choice lives in localStorage under
 * `orbit:theme`; what the page actually wears is `data-theme` on <html>, which
 * the token sets in index.css key off. index.html applies it before first paint
 * (same rules as resolveTheme) so a stored light choice never flashes dark.
 */
export const THEME_KEY = 'orbit:theme';
export const CHOICES = ['light', 'dark', 'system'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Dark unless the attendee chose otherwise — a missing or unknown value is dark too. */
export function resolveTheme(choice, osPrefersDark) {
  if (choice === 'light' || choice === 'dark') return choice;
  if (choice === 'system') return osPrefersDark ? 'dark' : 'light';
  return 'dark';
}

export function readChoice() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return CHOICES.includes(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

const osPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

/** `{ choice, resolved, setChoice }` — and keeps <html data-theme> in step. */
export function useTheme() {
  const [choice, setChoiceState] = useState(readChoice);
  const [osDark, setOsDark] = useState(osPrefersDark);

  // Follow the OS only while the choice is System; re-read on entering it.
  useEffect(() => {
    if (choice !== 'system') return undefined;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e) => setOsDark(e.matches);
    setOsDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const resolved = resolveTheme(choice, osDark);
  useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);

  const setChoice = (next) => {
    if (!CHOICES.includes(next)) return;
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* private mode: the choice lasts this visit */ }
    setChoiceState(next);
  };

  return { choice, resolved, setChoice };
}
