/**
 * Thin fetch wrapper. Every network call in the app goes through `api()`.
 *
 * Convention: callers get parsed JSON or a thrown Error. No component
 * should ever call fetch() directly — put the endpoint here instead.
 */
const BASE = '/api';

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error ?? `Request failed: ${res.status}`);
    // Some 4xx responses are meaningful (a 409 carries the conflicting seat),
    // so keep the parsed body on the error rather than throwing it away.
    error.status = res.status;
    error.payload = body;
    throw error;
  }
  return res.json();
}

/** Build a query string, dropping empty/undefined values. */
const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const getBootstrap = () => api('/bootstrap');
export const getLive = ({ day, time }) => api(`/live${qs({ day, time })}`);
export const getSessions = (filters) => api(`/sessions${qs(filters)}`);
export const getSession = (id, userId) => api(`/sessions/${id}${qs({ userId })}`);
export const getFollowedSessions = (userId) => api(`/sessions${qs({ followedBy: userId })}`);
export const getSpeakers = (filters) => api(`/speakers${qs(filters)}`);
export const getSpeaker = (id) => api(`/speakers/${id}`);
export const getVenues = () => api('/venues');
export const getVendors = (filters) => api(`/vendors${qs(filters)}`);
export const getSponsors = () => api('/sponsors');
export const getAnnouncements = () => api('/announcements');
export const getUser = (id) => api(`/users/${id}`);
export const getSchedule = (userId) => api(`/users/${userId}/schedule`);
export const getToday = (userId, { day, time }) => api(`/users/${userId}/today${qs({ day, time })}`);

export const reserveSeat = (userId, sessionId, now) =>
  api(`/users/${userId}/reservations/${sessionId}`, { method: 'PUT', body: JSON.stringify(now ?? {}) });
export const releaseSeat = (userId, sessionId) => api(`/users/${userId}/reservations/${sessionId}`, { method: 'DELETE' });

export const getAttendance = (userId, sessionId, { day, time }) =>
  api(`/users/${userId}/attendance/${sessionId}${qs({ day, time })}`);

export const checkIn = (userId, sessionId, now) =>
  api(`/users/${userId}/checkins/${sessionId}`, { method: 'PUT', body: JSON.stringify(now) });

export const rateSession = (userId, sessionId, payload) =>
  api(`/users/${userId}/ratings/${sessionId}`, { method: 'PUT', body: JSON.stringify(payload) });

export const agendaCalendarUrl = (userId) => `/api/users/${userId}/agenda.ics`;
export const sessionCalendarUrl = (sessionId) => `/api/sessions/${sessionId}.ics`;

export const followSpeaker = (userId, speakerId) => api(`/users/${userId}/follows/${speakerId}`, { method: 'PUT' });
export const unfollowSpeaker = (userId, speakerId) => api(`/users/${userId}/follows/${speakerId}`, { method: 'DELETE' });
export const setInterests = (userId, interests) =>
  api(`/users/${userId}/interests`, { method: 'PUT', body: JSON.stringify({ interests }) });
