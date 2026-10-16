import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';
import { hasEnded, useConferenceClock } from './clock.js';
import { useToast } from '../components/Toaster.jsx';

/**
 * One app-wide context holding:
 *   - the bootstrap payload (venues, tracks, tags, rooms, days, attendees)
 *   - the currently selected attendee, their reservations and who they follow
 *
 * Page-level data (session lists, speaker detail, …) is fetched per page
 * with the `useFetch` hook below. Only genuinely global state lives here.
 */
const ConferenceContext = createContext(null);

const STORAGE_KEY = 'orbit:currentUserId';

export function ConferenceProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 1;
  });
  const [followingIds, setFollowingIds] = useState(() => new Set());
  // sessionId -> 'confirmed' | 'waitlisted'
  const [reservations, setReservations] = useState(() => new Map());
  // sessionId -> live seat counts, so a reservation updates every view at once
  const [seatCounts, setSeatCounts] = useState(() => new Map());
  // an overlapping booking the attendee has to resolve
  const [conflict, setConflict] = useState(null);
  const clock = useConferenceClock(data?.days ?? []);
  const toast = useToast();

  useEffect(() => {
    api.getBootstrap().then(setData).catch(setError);
  }, []);

  useEffect(() => {
    let active = true;
    localStorage.setItem(STORAGE_KEY, String(currentUserId));
    // Never let one attendee act on the previous attendee's state.
    setFollowingIds(new Set());
    setReservations(new Map());
    api.getUser(currentUserId)
      .then((u) => {
        if (!active) return;
        setFollowingIds(new Set(u.followedSpeakers.map((s) => s.id)));
        setReservations(new Map((u.reservations ?? []).map((r) => [r.sessionId, r.status])));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUserId]);

  const toggleFollow = useCallback(async (speakerId) => {
    const following = followingIds.has(speakerId);
    const call = following ? api.unfollowSpeaker : api.followSpeaker;
    await call(currentUserId, speakerId);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (following) next.delete(speakerId);
      else next.add(speakerId);
      return next;
    });
    toast({ message: following ? 'Unfollowed' : 'Following — their sessions show in your feed', icon: 'bell' });
  }, [currentUserId, followingIds, toast]);

  /** Apply a seat-state payload from the API to local state. */
  const applySeatState = useCallback((state) => {
    setSeatCounts((prev) => new Map(prev).set(state.sessionId, {
      seatsTaken: state.seatsTaken,
      seatsLeft: state.seatsLeft,
      capacity: state.capacity,
      isFull: state.isFull,
      waitlistCount: state.waitlistCount,
      waitlistPosition: state.waitlistPosition ?? null,
    }));
    setReservations((prev) => {
      const next = new Map(prev);
      if (state.status) next.set(state.sessionId, state.status);
      else next.delete(state.sessionId);
      return next;
    });
  }, []);

  /**
   * The single action in this app: add a session to your agenda, which takes a
   * seat (or a waitlist place). There is no separate bookmark — see CLAUDE.md.
   */
  const reserveSeat = useCallback(async (sessionId) => {
    let state;
    try {
      state = await api.reserveSeat(currentUserId, sessionId, clock);
    } catch (err) {
      // 409 means an overlapping seat; the API sends the clash back in the body
      if (err.status !== 409) throw err;
      state = err.payload;
    }
    if (state.rejected === 'ended') {
      toast({ message: 'That session has already finished', icon: 'clock' });
      return state;
    }
    if (state.rejected === 'overlap') {
      // A choice between two sessions, not an error — hand it to the dialog.
      setConflict(state);
      return state;
    }

    applySeatState(state);
    toast({
      message: state.backup
        ? `Room is full — you are #${state.waitlistPosition} on the waitlist. You keep “${state.backup.title}” until a place opens, then it is released.`
        : state.status === 'waitlisted'
          ? `Room is full — you are #${state.waitlistPosition} on the waitlist`
          : 'Seat booked',
      icon: state.status === 'waitlisted' ? 'clock' : 'ticket',
    });
    return state;
  }, [currentUserId, applySeatState, toast, clock]);

  /**
    * Give a seat back. Pass the session too: Undo is a fresh `reserveSeat`, and
    * the API refuses one for a session that is over, so offering the button
    * there is an error waiting to happen. No session means no Undo, so a caller
    * cannot re-open that by forgetting to pass it.
    */
  const releaseSeat = useCallback(async (sessionId, session) => {
    const state = await api.releaseSeat(currentUserId, sessionId, clock);
    applySeatState(state);
    const canUndo = session ? !hasEnded(session, clock) : false;
    toast({
      message: state.promoted ? 'Removed — your seat went to someone on the waitlist' : 'Removed from your agenda',
      icon: 'check',
      ...(canUndo ? { action: { label: 'Undo', onClick: () => reserveSeat(sessionId) } } : {}),
    });
    return state;
  }, [currentUserId, applySeatState, toast, reserveSeat, clock]);

  /** Toggle a session on or off the agenda. */
  const toggleSeat = useCallback(
    (sessionId, session) => (reservations.has(sessionId) ? releaseSeat(sessionId, session) : reserveSeat(sessionId)),
    [reservations, reserveSeat, releaseSeat],
  );

  const resolveConflict = useCallback(async (swap) => {
    if (!conflict) return;
    if (swap) {
      try {
        applySeatState(await api.releaseSeat(currentUserId, conflict.conflictsWith.id, clock));
        const state = await api.reserveSeat(currentUserId, conflict.wanted.id, clock);
        applySeatState(state);
        toast(state.status === 'waitlisted'
          ? {
            message: `Swapped — “${conflict.wanted.title}” is full, so you are ${state.waitlistPosition ? `#${state.waitlistPosition} ` : ''}on the waitlist`,
            icon: 'clock',
          }
          : { message: `Swapped to “${conflict.wanted.title}”`, icon: 'check' });
      } catch (err) {
        toast({ message: `Could not swap: ${err.message}`, icon: 'alert' });
      }
    }
    setConflict(null);
  }, [conflict, currentUserId, applySeatState, toast, clock]);

  const value = useMemo(() => {
    const users = data?.users ?? [];
    return {
      ...(data ?? {}),
      ready: !!data,
      error,
      clock,
      currentUser: users.find((u) => u.id === currentUserId) ?? users[0] ?? null,
      currentUserId,
      setCurrentUserId,
      followingIds,
      isFollowing: (id) => followingIds.has(id),
      toggleFollow,
      reservations,
      reservationFor: (id) => reservations.get(id) ?? null,
      seatCounts,
      seatsFor: (id) => seatCounts.get(id) ?? null,
      reserveSeat,
      releaseSeat,
      toggleSeat,
      onAgenda: (id) => reservations.has(id),
      conflict,
      resolveConflict,
      trackBySlug: Object.fromEntries((data?.tracks ?? []).map((t) => [t.slug, t])),
      venueById: Object.fromEntries((data?.venues ?? []).map((v) => [v.id, v])),
      roomById: Object.fromEntries((data?.rooms ?? []).map((r) => [r.id, r])),
    };
  }, [data, error, clock, currentUserId, followingIds, toggleFollow,
      reservations, seatCounts, reserveSeat, releaseSeat, toggleSeat,
      conflict, resolveConflict]);

  return <ConferenceContext.Provider value={value}>{children}</ConferenceContext.Provider>;
}

export function useConference() {
  const ctx = useContext(ConferenceContext);
  if (!ctx) throw new Error('useConference must be used inside <ConferenceProvider>');
  return ctx;
}

/**
 * Minimal data-fetching hook: `useFetch(() => api.getSessions({ day }), [day])`.
 * Returns { data, loading, error, reload }.
 */
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fn())
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((error) => active && setState({ data: null, loading: false, error }));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
