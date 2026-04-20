import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STALL_MS = 15000;

function AuthLandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate('/campaign', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || user) return undefined;
    const t = window.setTimeout(() => setStalled(true), STALL_MS);
    return () => window.clearTimeout(t);
  }, [loading, user]);

  return (
    <div className="page-container">
      <h1>Completing login…</h1>
      <p>Hang tight while we finish signing you in.</p>
      {stalled && (
        <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-amber-100">
          <p className="font-medium">Still not signed in?</p>
          <p className="mt-2 text-sm text-amber-100/80">
            This page normally appears only briefly. If you are stuck here, open the site from the same URL you
            started login on, or try signing in again.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="text-sm text-sky-300 underline hover:text-sky-200"
              href={import.meta.env.BASE_URL || '/'}
            >
              Home
            </a>
            <a className="text-sm text-sky-300 underline hover:text-sky-200" href="#/login">
              Try login again
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthLandingPage;
