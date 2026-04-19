import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * SignupModal — Google OAuth sign-up flow.
 *
 * Props:
 *   isOpen        {boolean}   Whether the modal is visible
 *   onClose       {function}  Close the modal
 *   onGoogleLogin {function}  Called with (credential, username) on success
 *   onOpenLogin   {function}  Switch to the login modal
 */
function SignupModal({ isOpen, onClose, onGoogleLogin, onOpenLogin }) {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleInitializedRef = useRef(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setError('');
      setGoogleSubmitting(false);
    }
  }, [isOpen]);

  // Lazy-load the Google Identity Services script
  useEffect(() => {
    if (!isOpen) return undefined;

    let isMounted = true;
    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    if (existingScript) {
      const alreadyLoaded =
        existingScript.dataset.loaded === 'true' ||
        existingScript.readyState === 'complete';
      if (alreadyLoaded) {
        setGoogleReady(true);
      } else {
        const handleLoad = () => isMounted && setGoogleReady(true);
        existingScript.addEventListener('load', handleLoad);
        return () => {
          isMounted = false;
          existingScript.removeEventListener('load', handleLoad);
        };
      }
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      if (isMounted) setGoogleReady(true);
    };
    document.head.appendChild(script);

    return () => {
      isMounted = false;
      script.onload = null;
    };
  }, [isOpen]);

  const handleGoogleCredential = useCallback(
    async (response) => {
      if (!response?.credential) {
        setError('Google sign-in did not return a credential.');
        setGoogleSubmitting(false);
        return;
      }
      try {
        await onGoogleLogin(response.credential, username);
        onClose?.();
      } catch (err) {
        setError(err.message || 'Unable to sign up with Google.');
      } finally {
        setGoogleSubmitting(false);
      }
    },
    [onClose, onGoogleLogin, username],
  );

  const handleGoogleSignUp = () => {
    setError('');

    if (!onGoogleLogin) {
      setError('Google Sign-In is not available right now.');
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      setError('Google Sign-In is not configured.');
      return;
    }
    if (googleSubmitting) return;

    const isReady =
      window.google?.accounts?.id &&
      (googleReady || googleInitializedRef.current);
    if (!isReady) {
      setError('Google Sign-In is still loading. Please try again.');
      return;
    }

    setGoogleSubmitting(true);

    if (!googleInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleInitializedRef.current = true;
    }

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setGoogleSubmitting(false);
        setError('Google Sign-In was dismissed or could not start.');
      }
    });
  };

  const handleBackToLogin = () => {
    onClose?.();
    onOpenLogin?.();
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal" role="dialog" aria-modal="true">
      <div className="auth-modal__content">
        <header className="auth-modal__header">
          <h2>Sign Up</h2>
          <button
            type="button"
            className="auth-modal__close"
            onClick={onClose}
            aria-label="Close sign up form"
          >
            ✕
          </button>
        </header>

        <form className="auth-modal__form" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Username (display name)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a display name"
              autoComplete="username"
            />
          </label>

          <p className="auth-modal__note">
            Accounts are secured with Google. Pick a display name, then sign in
            below.
          </p>

          <button
            type="button"
            className="auth-modal__google"
            onClick={handleGoogleSignUp}
            disabled={googleSubmitting}
          >
            <span className="auth-modal__google-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" role="presentation">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.15 0 5.98 1.08 8.2 3.2l6.12-6.12C34.7 3.08 29.87 1 24 1 14.6 1 6.5 6.35 2.7 14l7.68 5.97C12.38 14.02 17.7 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.5 24.5c0-1.57-.15-3.08-.44-4.55H24v9.1h12.7c-.55 2.96-2.2 5.46-4.69 7.13l7.28 5.66C43.9 37.44 46.5 31.42 46.5 24.5z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.38 28.03A14.47 14.47 0 0 1 9.5 24c0-1.4.24-2.75.68-4.03l-7.67-5.97A23.9 23.9 0 0 0 0 24c0 3.9.93 7.58 2.56 10.85l7.82-6.82z"
                />
                <path
                  fill="#34A853"
                  d="M24 47c6.48 0 11.9-2.13 15.86-5.83l-7.28-5.66c-2.03 1.37-4.64 2.19-8.58 2.19-6.3 0-11.62-4.52-13.66-10.47l-7.68 6C6.5 41.65 14.6 47 24 47z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            </span>
            {googleSubmitting ? 'Opening Google…' : 'Continue with Google'}
          </button>

          {error && <p className="auth-modal__error">{error}</p>}
        </form>

        <p className="auth-modal__note">
          New accounts start as pending until an admin approves them.
        </p>

        <div className="auth-modal__switch">
          <span>Already have an account?</span>
          <button
            type="button"
            className="auth-modal__link"
            onClick={handleBackToLogin}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignupModal;
