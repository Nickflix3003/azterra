/**
 * apiClient — thin fetch wrapper for the Azterra backend.
 *
 * - Always sends credentials (session cookie)
 * - Throws a descriptive Error on non-OK responses
 * - Returns parsed JSON on success
 *
 * Usage:
 *   import { apiGet, apiPost } from '../utils/apiClient';
 *
 *   const data = await apiGet('/locations');
 *   const result = await apiPost('/admin/updateRole', { userId, newRole });
 */

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(method, path, body) {
  const url = `${BASE}${path}`;
  const options = {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Network error — check your connection and that the server is running.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response (e.g. 502 HTML page from a proxy)
    throw new Error(`Server error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }

  return data;
}

export const apiGet  = (path)        => request('GET',    path);
export const apiPost = (path, body)  => request('POST',   path, body);
export const apiPut  = (path, body)  => request('PUT',    path, body);
export const apiPatch = (path, body) => request('PATCH',  path, body);
export const apiDel  = (path)        => request('DELETE', path);
