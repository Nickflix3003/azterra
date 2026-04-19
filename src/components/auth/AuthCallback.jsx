import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchWithRetry } from '../../utils/fetchWithRetry';

const API_BASE_URL = '/api';

// This page receives the OAuth redirect from Supabase (via the frontend
// redirect_to URL). Supabase resolves the PKCE/implicit flow in the browser
// and fires onAuthStateChange with SIGNED_IN + a session. We grab the
// access_token, POST it to our backend to mint a session cookie, then
// call refreshUser() to hydrate the frontend and redirect home.

function AuthCallback() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('Completing sign-in…');
  const [error, setError] = useState(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured. Check your environment variables.');
      return;
    }

    async function exchangeSession(accessToken) {
      if (handled.current) return;
      handled.current = true;

      try {
        setStatus('Verifying with server…');
        // Use absolute URL so the session cookie is set on the API domain
        // (azterra-api.onrender.com), not on the Vercel proxy domain.
        const res = await fetchWithRetry(`${API_BASE_URL}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ access_token: accessToken }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error ${res.status}`);
        }

        setStatus('Signing you in…');
        await refreshUser();
        window.location.replace('/');
      } catch (err) {
        console.error('AuthCallback error:', err);
        setError(err.message || 'Login failed. Please try again.');
      }
    }

    // Supabase client with detectSessionInUrl:true will automatically parse the
    // hash fragment / PKCE code when this page loads. Subscribe to state changes
    // so we catch the SIGNED_IN event regardless of timing.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.access_token) {
          exchangeSession(session.access_token);
        }
      }
    );

    // Also check if a session is already resolved (race: event may fire before
    // the listener is registered on a fast device).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token && !handled.current) {
        exchangeSession(data.session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#e53e3e', marginBottom: '1rem' }}>Login Failed</h2>
        <p style={{ color: '#718096', maxWidth: '400px' }}>{error}</p>
        <a href="/" style={{ marginTop: '1.5rem', color: '#667eea', textDecoration: 'underline' }}>← Back to Azterra</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚔️</div>
      <p style={{ color: '#718096', fontSize: '1.1rem' }}>{status}</p>
    </div>
  );
}

export default AuthCallback;
