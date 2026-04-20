import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    })
  : null;

/** Frontend OAuth return path; matches server `getFrontendCallbackUrl` when unset. */
export function getSupabaseRedirectUrl() {
  if (import.meta.env.VITE_SUPABASE_REDIRECT_URL) {
    return import.meta.env.VITE_SUPABASE_REDIRECT_URL;
  }
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin.replace(/\/$/, '');
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${base}/auth/callback`;
}
