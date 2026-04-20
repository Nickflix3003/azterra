/**
 * Same-origin API base for all authenticated fetches.
 *
 * Vercel rewrites `/api/*` to the Render backend so `Set-Cookie` applies to the
 * page origin (e.g. *.vercel.app). Do not point auth calls at the raw Render URL
 * in production — the session cookie would land on the wrong host.
 */
export const API_BASE_URL = '/api';
