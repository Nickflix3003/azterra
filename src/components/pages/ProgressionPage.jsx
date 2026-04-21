import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSecrets } from '../../context/SecretDataContext';
import { useContent } from '../../context/ContentContext';
import SecretScopeField from '../UI/SecretScopeField';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
} from '../../constants/contentConstants';

const API_BASE_URL = '/api';

const EMPTY_SECRET_DRAFT = {
  id: '',
  title: '',
  description: '',
  keyword: '',
};

const EMPTY_CONTENT_DRAFT = {
  id: '',
  title: '',
  type: 'lore',
  status: 'draft',
  summary: '',
  body: '',
  secretId: null,
};

function buildSecretDraft(secret = {}) {
  return {
    id: secret.id || '',
    title: secret.title || '',
    description: secret.description || '',
    keyword: secret.keyword || '',
  };
}

function buildContentDraft(entry = {}) {
  return {
    id: entry.id || '',
    title: entry.title || '',
    type: entry.type || 'lore',
    status: entry.status || 'draft',
    summary: entry.summary || '',
    body: entry.body || '',
    secretId: entry.secretId || null,
  };
}

function ProgressionPage() {
  const { refreshUser, role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [phrase, setPhrase] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [adminError, setAdminError] = useState('');
  const [unlockedDetails, setUnlockedDetails] = useState([]);

  const {
    secrets,
    users,
    loadingSecrets,
    loadingUsers,
    refreshSecretUsers,
    createSecret,
    updateSecret,
    deleteSecret,
    grantSecret,
    revokeSecret,
    getSecretById,
  } = useSecrets();
  const {
    entries,
    createEntry,
    updateEntry,
    deleteEntry,
    refresh: refreshContent,
  } = useContent();

  const [newSecretDraft, setNewSecretDraft] = useState(EMPTY_SECRET_DRAFT);
  const [secretDrafts, setSecretDrafts] = useState({});
  const [savingSecretId, setSavingSecretId] = useState(null);
  const [deletingSecretId, setDeletingSecretId] = useState(null);
  const [assignmentKey, setAssignmentKey] = useState('');

  const [newEntryDraft, setNewEntryDraft] = useState(EMPTY_CONTENT_DRAFT);
  const [entryDrafts, setEntryDrafts] = useState({});
  const [savingEntryId, setSavingEntryId] = useState(null);
  const [deletingEntryId, setDeletingEntryId] = useState(null);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        String(a.title || a.id || '').localeCompare(String(b.title || b.id || ''))
      ),
    [entries]
  );
  const unlockedSecretIds = useMemo(
    () => unlockedDetails.map((secret) => secret.id),
    [unlockedDetails]
  );
  const revealedLoreEntries = useMemo(
    () =>
      sortedEntries.filter((entry) =>
        entry.secretId ? unlockedSecretIds.includes(entry.secretId) || isAdmin : false
      ),
    [isAdmin, sortedEntries, unlockedSecretIds]
  );

  const fetchProgress = async () => {
    if (!user) {
      setUnlockedDetails([]);
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
      setUnlockedDetails(Array.isArray(data.details) ? data.details : []);
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
    setSecretDrafts((prev) => {
      const next = { ...prev };
      secrets.forEach((secret) => {
        next[secret.id] = {
          ...(next[secret.id] || {}),
          ...buildSecretDraft(secret),
        };
      });
      Object.keys(next).forEach((id) => {
        if (!secrets.some((secret) => secret.id === id)) {
          delete next[id];
        }
      });
      return next;
    });
  }, [secrets]);

  useEffect(() => {
    setEntryDrafts((prev) => {
      const next = { ...prev };
      entries.forEach((entry) => {
        next[entry.id] = {
          ...(next[entry.id] || {}),
          ...buildContentDraft(entry),
        };
      });
      Object.keys(next).forEach((id) => {
        if (!entries.some((entry) => String(entry.id) === String(id))) {
          delete next[id];
        }
      });
      return next;
    });
  }, [entries]);

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
      setUnlockedDetails(Array.isArray(data.details) ? data.details : []);
      setPhrase('');
      await refreshUser();
    } catch (err) {
      setProgressError(err.message || 'Unable to check secret.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleSecretDraftChange = (secretId, field, value) => {
    setSecretDrafts((prev) => ({
      ...prev,
      [secretId]: {
        ...(prev[secretId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSecretReset = (secretId) => {
    const current = secrets.find((secret) => secret.id === secretId);
    if (!current) return;
    setSecretDrafts((prev) => ({
      ...prev,
      [secretId]: buildSecretDraft(current),
    }));
  };

  const handleSecretSave = async (secretId) => {
    const draft = secretDrafts[secretId];
    if (!draft) return;
    setSavingSecretId(secretId);
    setAdminError('');
    try {
      await updateSecret(secretId, draft);
    } catch (err) {
      setAdminError(err.message || 'Unable to save secret.');
    } finally {
      setSavingSecretId(null);
    }
  };

  const handleSecretCreate = async () => {
    setSavingSecretId('__new__');
    setAdminError('');
    try {
      const created = await createSecret(newSecretDraft);
      setNewSecretDraft(EMPTY_SECRET_DRAFT);
      setSecretDrafts((prev) => ({
        ...prev,
        [created.id]: buildSecretDraft(created),
      }));
      await refreshSecretUsers();
    } catch (err) {
      setAdminError(err.message || 'Unable to create secret.');
    } finally {
      setSavingSecretId(null);
    }
  };

  const handleSecretDelete = async (secretId) => {
    setDeletingSecretId(secretId);
    setAdminError('');
    try {
      await deleteSecret(secretId);
      await refreshContent();
    } catch (err) {
      setAdminError(err.message || 'Unable to delete secret.');
    } finally {
      setDeletingSecretId(null);
    }
  };

  const handleAssignmentToggle = async (userId, secretId, enabled) => {
    const key = `${userId}:${secretId}`;
    setAssignmentKey(key);
    setAdminError('');
    try {
      if (enabled) {
        await revokeSecret(userId, secretId);
      } else {
        await grantSecret(userId, secretId);
      }
    } catch (err) {
      setAdminError(err.message || 'Unable to update assignment.');
    } finally {
      setAssignmentKey('');
    }
  };

  const handleEntryDraftChange = (entryId, field, value) => {
    setEntryDrafts((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] || {}),
        [field]: value,
      },
    }));
  };

  const handleEntryReset = (entryId) => {
    const current = entries.find((entry) => String(entry.id) === String(entryId));
    if (!current) return;
    setEntryDrafts((prev) => ({
      ...prev,
      [entryId]: buildContentDraft(current),
    }));
  };

  const handleEntrySave = async (entryId) => {
    const draft = entryDrafts[entryId];
    if (!draft) return;
    setSavingEntryId(entryId);
    setAdminError('');
    try {
      await updateEntry(entryId, draft);
    } catch (err) {
      setAdminError(err.message || 'Unable to save content entry.');
    } finally {
      setSavingEntryId(null);
    }
  };

  const handleEntryCreate = async () => {
    setSavingEntryId('__new__');
    setAdminError('');
    try {
      await createEntry(newEntryDraft);
      setNewEntryDraft(EMPTY_CONTENT_DRAFT);
    } catch (err) {
      setAdminError(err.message || 'Unable to create content entry.');
    } finally {
      setSavingEntryId(null);
    }
  };

  const handleEntryDelete = async (entryId) => {
    setDeletingEntryId(entryId);
    setAdminError('');
    try {
      await deleteEntry(entryId);
    } catch (err) {
      setAdminError(err.message || 'Unable to delete content entry.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  return (
    <div className="page-container progression">
      <header className="progression__header">
        <div>
          <p className="progression__eyebrow">Progression</p>
          <h1>Hidden Paths</h1>
          <p className="progression__subtitle">
            Enter a phrase to unlock secrets. Admins can also manage secret lore and decide which players can see it.
          </p>
        </div>
      </header>

      <form className="progression__form" onSubmit={handleUnlock}>
        <input
          type="text"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          placeholder="Enter a secret phrase"
          disabled={!user}
        />
        <button type="submit" disabled={!user || unlocking || !phrase.trim()}>
          {unlocking ? 'Checking...' : 'Submit'}
        </button>
        {progressError && <p className="progression__error">{progressError}</p>}
        {!user && <p className="progression__muted">Login to record your progress.</p>}
      </form>

      {progressLoading && <p className="progression__muted">Loading your progress...</p>}
      {!progressLoading && unlockedDetails.length === 0 && (
        <div className="progression__empty">
          <p>Nothing unlocked yet. Keep exploring.</p>
        </div>
      )}

      {unlockedDetails.length > 0 && (
        <section className="progression__grid">
          {unlockedDetails.map((secret) => (
            <article key={secret.id} className="progression__card">
              <p className="progression__badge">{isAdmin ? 'DM View' : 'Unlocked'}</p>
              <h2>{secret.title}</h2>
              {secret.keyword && (
                <p className="progression__keyword">
                  Keyword: <code>{secret.keyword}</code>
                </p>
              )}
              <p>{secret.description}</p>
            </article>
          ))}
        </section>
      )}

      {revealedLoreEntries.length > 0 && (
        <section className="progression__admin-section">
          <div className="progression__section-head">
            <div>
              <p className="progression__eyebrow">Revealed Lore</p>
              <h2>What This Unlocks</h2>
            </div>
            <p className="progression__muted">
              Entries saved to the secret system appear here as soon as the matching secret is unlocked.
            </p>
          </div>
          <div className="progression__grid">
            {revealedLoreEntries.map((entry) => (
              <article key={entry.id} className="progression__card">
                <p className="progression__badge">
                  {entry.secretId ? getSecretById(entry.secretId)?.title || entry.secretId : 'Public'}
                </p>
                <h3>{entry.title}</h3>
                {entry.summary && <p className="progression__muted">{entry.summary}</p>}
                <p>{entry.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {isAdmin && (
        <>
          <section className="progression__admin-section">
            <div className="progression__section-head">
              <div>
                <p className="progression__eyebrow">DM Tools</p>
                <h2>Secrets Catalog</h2>
              </div>
              <p className="progression__muted">
                Create reusable secrets, edit their phrases, and use the same IDs across the map, atlas, people page, and lore entries.
              </p>
            </div>

            {adminError && <p className="progression__error">{adminError}</p>}

            <div className="progression__panel-grid">
              <article className="progression__card progression__card--editor">
                <p className="progression__badge">New Secret</p>
                <div className="progression__card-edit">
                  <label>
                    <span>Id</span>
                    <input
                      type="text"
                      value={newSecretDraft.id}
                      onChange={(event) =>
                        setNewSecretDraft((prev) => ({ ...prev, id: event.target.value }))
                      }
                      placeholder="Optional slug"
                    />
                  </label>
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={newSecretDraft.title}
                      onChange={(event) =>
                        setNewSecretDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="The Crimson Archive"
                    />
                  </label>
                  <label>
                    <span>Unlock Phrase</span>
                    <input
                      type="text"
                      value={newSecretDraft.keyword}
                      onChange={(event) =>
                        setNewSecretDraft((prev) => ({ ...prev, keyword: event.target.value }))
                      }
                      placeholder="Optional player phrase"
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={newSecretDraft.description}
                      onChange={(event) =>
                        setNewSecretDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      placeholder="What this secret unlocks"
                    />
                  </label>
                  <div className="progression__card-actions">
                    <button
                      type="button"
                      onClick={handleSecretCreate}
                      disabled={savingSecretId === '__new__'}
                    >
                      {savingSecretId === '__new__' ? 'Creating...' : 'Create Secret'}
                    </button>
                  </div>
                </div>
              </article>

              {loadingSecrets ? (
                <p className="progression__muted">Loading secrets...</p>
              ) : (
                secrets.map((secret) => (
                  <article key={secret.id} className="progression__card progression__card--editor">
                    <p className="progression__badge">Secret</p>
                    <div className="progression__card-edit">
                      <label>
                        <span>Id</span>
                        <input type="text" value={secret.id} disabled />
                      </label>
                      <label>
                        <span>Title</span>
                        <input
                          type="text"
                          value={secretDrafts[secret.id]?.title || ''}
                          onChange={(event) =>
                            handleSecretDraftChange(secret.id, 'title', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Unlock Phrase</span>
                        <input
                          type="text"
                          value={secretDrafts[secret.id]?.keyword || ''}
                          onChange={(event) =>
                            handleSecretDraftChange(secret.id, 'keyword', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Description</span>
                        <textarea
                          rows={3}
                          value={secretDrafts[secret.id]?.description || ''}
                          onChange={(event) =>
                            handleSecretDraftChange(secret.id, 'description', event.target.value)
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
                        <button
                          type="button"
                          className="progression__danger-button"
                          onClick={() => handleSecretDelete(secret.id)}
                          disabled={deletingSecretId === secret.id}
                        >
                          {deletingSecretId === secret.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="progression__admin-section">
            <div className="progression__section-head">
              <div>
                <p className="progression__eyebrow">DM Tools</p>
                <h2>Player Assignment</h2>
              </div>
              <p className="progression__muted">
                Toggle which players can see each secret. Phrase unlocks and manual grants both feed the same unlocked list.
              </p>
            </div>

            <div className="progression__assignment-list">
              {loadingUsers ? (
                <p className="progression__muted">Loading players...</p>
              ) : (
                users.map((entry) => (
                  <article key={entry.id} className="progression__card progression__assignment-card">
                    <div className="progression__assignment-head">
                      <div>
                        <h3>{entry.name || entry.username || entry.email}</h3>
                        <p className="progression__muted">
                          {entry.email || entry.username || 'No identifier'} · {entry.role}
                        </p>
                      </div>
                      <span className="progression__badge">
                        {entry.unlockedSecrets.length} unlocked
                      </span>
                    </div>
                    <div className="progression__assignment-grid">
                      {secrets.map((secret) => {
                        const enabled = entry.unlockedSecrets.includes(secret.id);
                        const key = `${entry.id}:${secret.id}`;
                        return (
                          <button
                            key={secret.id}
                            type="button"
                            className={`progression__secret-toggle ${enabled ? 'is-active' : ''}`}
                            onClick={() => handleAssignmentToggle(entry.id, secret.id, enabled)}
                            disabled={assignmentKey === key}
                          >
                            <span>{secret.title}</span>
                            <small>{assignmentKey === key ? 'Saving...' : enabled ? 'Granted' : 'Locked'}</small>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="progression__admin-section">
            <div className="progression__section-head">
              <div>
                <p className="progression__eyebrow">DM Tools</p>
                <h2>Secret Lore Entries</h2>
              </div>
              <p className="progression__muted">
                Store website lore here and scope it to a secret when needed. Public entries stay visible to everyone; secret-scoped entries only render for the DM and unlocked players.
              </p>
            </div>

            <div className="progression__panel-grid">
              <article className="progression__card progression__card--editor">
                <p className="progression__badge">New Entry</p>
                <div className="progression__card-edit">
                  <label>
                    <span>Id</span>
                    <input
                      type="text"
                      value={newEntryDraft.id}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, id: event.target.value }))
                      }
                      placeholder="Optional slug"
                    />
                  </label>
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={newEntryDraft.title}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={newEntryDraft.type}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, type: event.target.value }))
                      }
                    >
                      {CONTENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={newEntryDraft.status}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, status: event.target.value }))
                      }
                    >
                      {CONTENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SecretScopeField
                    secretId={newEntryDraft.secretId}
                    onChange={(nextSecretId) =>
                      setNewEntryDraft((prev) => ({ ...prev, secretId: nextSecretId }))
                    }
                  />
                  <label>
                    <span>Summary</span>
                    <textarea
                      rows={2}
                      value={newEntryDraft.summary}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, summary: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Body</span>
                    <textarea
                      rows={5}
                      value={newEntryDraft.body}
                      onChange={(event) =>
                        setNewEntryDraft((prev) => ({ ...prev, body: event.target.value }))
                      }
                    />
                  </label>
                  <div className="progression__card-actions">
                    <button
                      type="button"
                      onClick={handleEntryCreate}
                      disabled={savingEntryId === '__new__'}
                    >
                      {savingEntryId === '__new__' ? 'Creating...' : 'Create Entry'}
                    </button>
                  </div>
                </div>
              </article>

              {sortedEntries.map((entry) => {
                const draft = entryDrafts[entry.id] || buildContentDraft(entry);
                return (
                  <article key={entry.id} className="progression__card progression__card--editor">
                    <p className="progression__badge">
                      {draft.secretId ? `Secret: ${getSecretById(draft.secretId)?.title || draft.secretId}` : 'Public'}
                    </p>
                    <div className="progression__card-edit">
                      <label>
                        <span>Id</span>
                        <input type="text" value={entry.id} disabled />
                      </label>
                      <label>
                        <span>Title</span>
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(event) =>
                            handleEntryDraftChange(entry.id, 'title', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Type</span>
                        <select
                          value={draft.type}
                          onChange={(event) =>
                            handleEntryDraftChange(entry.id, 'type', event.target.value)
                          }
                        >
                          {CONTENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            handleEntryDraftChange(entry.id, 'status', event.target.value)
                          }
                        >
                          {CONTENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <SecretScopeField
                        secretId={draft.secretId}
                        onChange={(nextSecretId) =>
                          handleEntryDraftChange(entry.id, 'secretId', nextSecretId)
                        }
                      />
                      <label>
                        <span>Summary</span>
                        <textarea
                          rows={2}
                          value={draft.summary}
                          onChange={(event) =>
                            handleEntryDraftChange(entry.id, 'summary', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Body</span>
                        <textarea
                          rows={5}
                          value={draft.body}
                          onChange={(event) =>
                            handleEntryDraftChange(entry.id, 'body', event.target.value)
                          }
                        />
                      </label>
                      <div className="progression__card-actions">
                        <button
                          type="button"
                          onClick={() => handleEntrySave(entry.id)}
                          disabled={savingEntryId === entry.id}
                        >
                          {savingEntryId === entry.id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="progression__ghost-button"
                          onClick={() => handleEntryReset(entry.id)}
                          disabled={savingEntryId === entry.id}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="progression__danger-button"
                          onClick={() => handleEntryDelete(entry.id)}
                          disabled={deletingEntryId === entry.id}
                        >
                          {deletingEntryId === entry.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default ProgressionPage;
