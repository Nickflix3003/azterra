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

function isSafeFrontendRedirectUrl(rawValue) {
  if (!rawValue) return false;

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  return true;
}

/** Frontend OAuth return path; matches server `getFrontendCallbackUrl` when unset. */
export function getSupabaseRedirectUrl() {
  const configuredRedirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL;
  if (configuredRedirectUrl) {
    if (isSafeFrontendRedirectUrl(configuredRedirectUrl)) {
      return configuredRedirectUrl;
    }

    console.warn(
      'Ignoring VITE_SUPABASE_REDIRECT_URL because it points at an invalid auth callback. Falling back to the frontend /auth/callback route.'
    );
  }
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin.replace(/\/$/, '');
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${base}/auth/callback`;
}
