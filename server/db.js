/**
 * db.js — Supabase service-role client for all server-side DB access.
 *
 * Usage:
 *   import { db } from './db.js';
 *   const { data, error } = await db.from('locations').select('*');
 *
 * This module is lazy-initialized so it's safe to import before loadEnv() runs.
 */

import { createClient } from '@supabase/supabase-js';

let _db = null;

/**
 * Returns the Supabase service-role client.
 * This bypasses Row Level Security — only ever use it on the server.
 */
export function db() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  _db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _db;
}

/**
 * Throw a normalized Error from a Supabase { error } result.
 */
export function throwIfError(error, context = 'DB operation') {
  if (error) {
    const msg = error.message || JSON.stringify(error);
    throw new Error(`${context}: ${msg}`);
  }
}
