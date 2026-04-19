import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Tab IDs
const TAB_GOOGLE = 'google';
const TAB_EMAIL  = 'email';
const TAB_ADMIN  = 'admin';

function LoginPage() {
  const navigate = useNavigate();
  const { user, loginWithGoogle, loginWithEmail, loginWithPassword } = useAuth();

  const [activeTab, setActiveTab] = useState(TAB_GOOGLE);
  const [error, setError] = useState('');
  const [info, setInfo]   = useState('');

  // Magic-link state
  const [email, setEmail]                   = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  // Google OAuth state
  const [oauthSubmitting, setOauthSubmitting] = useState(false);

  // Admin password login state
  const [adminEmail, setAdminEmail]         = useState('');
  const [adminPassword, setAdminPassword]   = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const clearMessages = () => { setError(''); setInfo(''); };

  // ── Google OAuth ─────────────────────────────────────────────
  const handleOAuthSignIn = async () => {
    clearMessages();
    if (oauthSubmitting) return;
    setOauthSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err?.message || 'Unable to start Google login.');
      setOauthSubmitting(false);
    }
  };

  // ── Magic link ───────────────────────────────────────────────
  const handleMagicLink = async () => {
    clearMessages();
    if (emailSubmitting) return;
    setEmailSubmitting(true);
    try {
      await loginWithEmail({ email });
      setInfo('Magic link sent — check your inbox to finish signing in.');
    } catch (err) {
      setError(err?.message || 'Unable to send magic link.');
    } finally {
      setEmailSubmitting(false);
    }
  };

  // ── Admin password login ─────────────────────────────────────
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    if (adminSubmitting) return;
    setAdminSubmitting(true);
    try {
      await loginWithPassword({ email: adminEmail, password: adminPassword });
      // navigate happens via the useEffect above once `user` is set
    } catch (err) {
      setError(err?.message || 'Invalid email or password.');
      setAdminSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-modal__content auth-page__content">
        <header className="auth-modal__header">
          <h2>Login to Azterra</h2>
        </header>

        {/* Tab bar */}
        <div className="auth-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0' }}>
          {[
            { id: TAB_GOOGLE, label: 'Google' },
            { id: TAB_EMAIL,  label: 'Magic Link' },
            { id: TAB_ADMIN,  label: 'Password' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); clearMessages(); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.85rem',
                color: activeTab === tab.id ? 'var(--azterra-gold, #cfaa68)' : 'var(--azterra-ink-dim, #8a7a6a)',
                borderBottom: activeTab === tab.id ? '2px solid var(--azterra-gold, #cfaa68)' : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="auth-modal__form">
          {/* ── Google tab ── */}
          {activeTab === TAB_GOOGLE && (
            <>
              <p className="auth-modal__note">
                Sign in with your Google account. New accounts start as pending and
                must be approved by an admin before editor access is granted.
              </p>
              <button
                type="button"
                className="auth-modal__google"
                onClick={handleOAuthSignIn}
                disabled={oauthSubmitting}
              >
                <span className="auth-modal__google-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" role="presentation" width="20" height="20">
                    <path fill="#EA4335" d="M24 9.5c3.15 0 5.98 1.08 8.2 3.2l6.12-6.12C34.7 3.08 29.87 1 24 1 14.6 1 6.5 6.35 2.7 14l7.68 5.97C12.38 14.02 17.7 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.5c0-1.57-.15-3.08-.44-4.55H24v9.1h12.7c-.55 2.96-2.2 5.46-4.69 7.13l7.28 5.66C43.9 37.44 46.5 31.42 46.5 24.5z"/>
                    <path fill="#FBBC05" d="M10.38 28.03A14.47 14.47 0 0 1 9.5 24c0-1.4.24-2.75.68-4.03l-7.67-5.97A23.9 23.9 0 0 0 0 24c0 3.9.93 7.58 2.56 10.85l7.82-6.82z"/>
                    <path fill="#34A853" d="M24 47c6.48 0 11.9-2.13 15.86-5.83l-7.28-5.66c-2.03 1.37-4.64 2.19-8.58 2.19-6.3 0-11.62-4.52-13.66-10.47l-7.68 6C6.5 41.65 14.6 47 24 47z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                </span>
                {oauthSubmitting ? 'Redirecting to Google…' : 'Continue with Google'}
              </button>
            </>
          )}

          {/* ── Magic link tab ── */}
          {activeTab === TAB_EMAIL && (
            <>
              <p className="auth-modal__note">
                We'll email you a one-click sign-in link — no password needed.
              </p>
              <label htmlFor="login-email">
                Email
                <input
                  id="login-email"
                  type="email"
                  placeholder="adventurer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={emailSubmitting}
                  required
                  onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) handleMagicLink(); }}
                />
              </label>
              <button
                type="button"
                className="auth-modal__submit"
                onClick={handleMagicLink}
                disabled={emailSubmitting || !email.trim()}
              >
                {emailSubmitting ? 'Sending…' : 'Send magic link'}
              </button>
            </>
          )}

          {/* ── Admin password tab ── */}
          {activeTab === TAB_ADMIN && (
            <>
              <p className="auth-modal__note">
                For admin and local accounts. Enter your email and password to sign in directly.
              </p>
              <form onSubmit={handleAdminLogin}>
                <label htmlFor="admin-email">
                  Email
                  <input
                    id="admin-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    disabled={adminSubmitting}
                    required
                    autoComplete="email"
                  />
                </label>
                <label htmlFor="admin-password" style={{ marginTop: '0.75rem' }}>
                  Password
                  <input
                    id="admin-password"
                    type="password"
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    disabled={adminSubmitting}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <button
                  type="submit"
                  className="auth-modal__submit"
                  disabled={adminSubmitting || !adminEmail.trim() || !adminPassword}
                  style={{ marginTop: '1rem' }}
                >
                  {adminSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}

          {info  && <p className="auth-modal__note"  style={{ color: '#4caf6e', marginTop: '0.75rem' }}>{info}</p>}
          {error && <p className="auth-modal__error" style={{ marginTop: '0.75rem' }}>{error}</p>}
        </div>

        <div className="auth-modal__switch" style={{ marginTop: '1.5rem' }}>
          <span>New here?</span>
          <Link to="/signup" className="auth-modal__link">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
