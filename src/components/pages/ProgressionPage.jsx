import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = '/api';

function ProgressionPage() {
  const { refreshUser, role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [phrase, setPhrase] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [unlockedDetails, setUnlockedDetails] = useState([]);
  const [secretDrafts, setSecretDrafts] = useState({});
  const [savingSecretId, setSavingSecretId] = useState(null);
  const [adminEditMode, setAdminEditMode] = useState(false);

  const fetchProgress = async () => {
    if (!user) {
      setUnlockedDetails([]);
      setSecretDrafts({});
      return;
    }
    setProgressLoading(true);
    setProgressError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets/progress`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load progress.');
      }
      const details = data.details || [];
      setUnlockedDetails(details);
      setSecretDrafts(
        details.reduce((acc, secret) => {
          acc[secret.id] = {
            title: secret.title || '',
            description: secret.description || '',
            keyword: secret.keyword || '',
          };
          return acc;
        }, {})
      );
    } catch (err) {
      setProgressError(err.message || 'Unable to load progress.');
    } finally {
      setProgressLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminEditMode(false);
    }
  }, [isAdmin]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!phrase.trim() || !user) return;
    setUnlocking(true);
    setProgressError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ phrase }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to check secret.');
      }
      const details = data.details || [];
      setUnlockedDetails(details);
      setSecretDrafts(
        details.reduce((acc, secret) => {
          acc[secret.id] = {
            title: secret.title || '',
            description: secret.description || '',
            keyword: secret.keyword || '',
          };
          return acc;
        }, {})
      );
      setPhrase('');
      await refreshUser();
    } catch (err) {
      setProgressError(err.message || 'Unable to check secret.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleDraftChange = (secretId, field, value) => {
    setSecretDrafts((prev) => ({
      ...prev,
      [secretId]: {
        ...(prev[secretId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSecretReset = (secretId) => {
    const original = unlockedDetails.find((secret) => secret.id === secretId);
    if (!original) return;
    setSecretDrafts((prev) => ({
      ...prev,
      [secretId]: {
        title: original.title || '',
        description: original.description || '',
        keyword: original.keyword || '',
      },
    }));
  };

  const handleSecretSave = async (secretId) => {
    if (!user || !secretDrafts[secretId]) return;
    setSavingSecretId(secretId);
    setProgressError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets/${secretId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(secretDrafts[secretId]),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save secret.');
      }
      setUnlockedDetails((prev) =>
        prev.map((secret) => (secret.id === secretId ? data.secret : secret))
      );
      setSecretDrafts((prev) => ({
        ...prev,
        [secretId]: {
          title: data.secret.title || '',
          description: data.secret.description || '',
          keyword: data.secret.keyword || '',
        },
      }));
    } catch (err) {
      setProgressError(err.message || 'Unable to save secret.');
    } finally {
      setSavingSecretId(null);
    }
  };

  return (
    <div className="page-container progression">
      <header className="progression__header">
        <div>
          <p className="progression__eyebrow">Progression</p>
          <h1>Hidden Paths</h1>
          <p className="progression__subtitle">
            Enter phrases to unlock secrets. The page grows as you uncover more.
          </p>
        </div>
      </header>

      {isAdmin && (
        <div className="progression__admin-controls">
          <button type="button" onClick={() => setAdminEditMode((prev) => !prev)}>
            {adminEditMode ? 'Exit Edit Mode' : 'Admin Edit Mode'}
          </button>
          <p className="progression__muted">
            Admin mode reveals every secret and enables inline edits.
          </p>
        </div>
      )}

      <form className="progression__form" onSubmit={handleUnlock}>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="Enter a secret phrase"
          disabled={!user}
        />
        <button type="submit" disabled={!user || unlocking || !phrase.trim()}>
          {unlocking ? 'Checking...' : 'Submit'}
        </button>
        {progressError && <p className="progression__error">{progressError}</p>}
        {!user && <p className="progression__muted">Login to record your progress.</p>}
      </form>

      {!progressLoading && unlockedDetails.length === 0 && (
        <div className="progression__empty">
          <p>Nothing unlocked yet. Keep exploring.</p>
        </div>
      )}

      {progressLoading && <p className="progression__muted">Loading your progress...</p>}

      {unlockedDetails.length > 0 && (
        <>
          <section className="progression__grid">
            {unlockedDetails.map((secret) => (
              <article key={secret.id} className="progression__card">
                <p className="progression__badge">{isAdmin ? 'Admin' : 'Unlocked'}</p>
                {adminEditMode && isAdmin ? (
                  <div className="progression__card-edit">
                    <label>
                      <span>Title</span>
                      <input
                        type="text"
                        value={secretDrafts[secret.id]?.title || ''}
                        onChange={(e) => handleDraftChange(secret.id, 'title', e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Keyword</span>
                      <input
                        type="text"
                        value={secretDrafts[secret.id]?.keyword || ''}
                        onChange={(e) => handleDraftChange(secret.id, 'keyword', e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={secretDrafts[secret.id]?.description || ''}
                        onChange={(e) =>
                          handleDraftChange(secret.id, 'description', e.target.value)
                        }
                      />
                    </label>
                    <div className="progression__card-actions">
                      <button
                        type="button"
                        onClick={() => handleSecretSave(secret.id)}
                        disabled={savingSecretId === secret.id}
                      >
                        {savingSecretId === secret.id ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="progression__ghost-button"
                        onClick={() => handleSecretReset(secret.id)}
                        disabled={savingSecretId === secret.id}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2>{secret.title}</h2>
                    {secret.keyword && (
                      <p className="progression__keyword">
                        Keyword: <code>{secret.keyword}</code>
                      </p>
                    )}
                    <p>{secret.description}</p>
                  </>
                )}
              </article>
            ))}
          </section>
          {unlockedDetails.length >= 2 && (
            <section className="progression__steps">
              <h3>New paths available</h3>
              <p className="progression__muted">Sections appear as you progress.</p>
              <div className="progression__grid">
                <article className="progression__card subtle">
                  <p className="progression__badge">Lore</p>
                  <p>Unlocked fragments are now visible in their respective lore entries.</p>
                </article>
                {unlockedDetails.length >= 3 && (
                  <article className="progression__card subtle">
                    <p className="progression__badge">Clues</p>
                    <p>Future clues may surface as more secrets unlock.</p>
                  </article>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default ProgressionPage;
