import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSecrets } from '../../context/SecretDataContext';
import { useContent } from '../../context/ContentContext';
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
  allowPhraseUnlock: true,
  ownerId: '',
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
    allowPhraseUnlock: secret.allowPhraseUnlock !== false,
    ownerId: secret.ownerId || '',
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

function LinkedEntityList({ title, items, renderItem }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="progression__linked-group">
      <p className="progression__badge">{title}</p>
      <div className="progression__linked-list">
        {items.map(renderItem)}
      </div>
    </div>
  );
}

export default function SecretsPage() {
  const { refreshUser, role, user, loading } = useAuth();
  const isAdmin = role === 'admin';
  const canCreateSecrets = Boolean(user) && role !== 'guest' && role !== 'pending';
  const [phrase, setPhrase] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [manageError, setManageError] = useState('');
  const [unlockedDetails, setUnlockedDetails] = useState([]);

  const {
    secrets,
    manageableSecrets,
    visibleUnlockedSecrets,
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

  const manageableSecretIds = useMemo(
    () => new Set(manageableSecrets.map((secret) => secret.id)),
    [manageableSecrets]
  );
  const manageableEntries = useMemo(
    () => entries.filter((entry) => manageableSecretIds.has(String(entry.secretId || ''))),
    [entries, manageableSecretIds]
  );
  const discoveredSecrets = useMemo(
    () => visibleUnlockedSecrets.filter((secret) => !secret.canManage),
    [visibleUnlockedSecrets]
  );
  const summary = useMemo(
    () => ({
      owned: secrets.filter((secret) => secret.isOwned).length,
      unlocked: visibleUnlockedSecrets.length,
      viewers: manageableSecrets.reduce((count, secret) => count + secret.viewerCount, 0),
      links: manageableSecrets.reduce(
        (count, secret) =>
          count +
          secret.linkedCounts.locations +
          secret.linkedCounts.regions +
          secret.linkedCounts.npcs +
          secret.linkedCounts.content,
        0
      ),
    }),
    [manageableSecrets, secrets, visibleUnlockedSecrets]
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
        throw new Error(data.error || 'Unable to load secrets.');
      }
      setUnlockedDetails(Array.isArray(data.details) ? data.details : []);
    } catch (err) {
      setProgressError(err.message || 'Unable to load secrets.');
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
        if (!secrets.some((secret) => secret.id === id)) delete next[id];
      });
      return next;
    });
  }, [secrets]);

  useEffect(() => {
    setEntryDrafts((prev) => {
      const next = { ...prev };
      manageableEntries.forEach((entry) => {
        next[entry.id] = {
          ...(next[entry.id] || {}),
          ...buildContentDraft(entry),
        };
      });
      Object.keys(next).forEach((id) => {
        if (!manageableEntries.some((entry) => String(entry.id) === String(id))) delete next[id];
      });
      return next;
    });
  }, [manageableEntries]);

  useEffect(() => {
    if (!newEntryDraft.secretId && manageableSecrets.length > 0) {
      setNewEntryDraft((prev) => ({ ...prev, secretId: manageableSecrets[0].id }));
    }
  }, [manageableSecrets, newEntryDraft.secretId]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!phrase.trim() || !user) return;
    setUnlocking(true);
    setProgressError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phrase }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to unlock secret.');
      }
      setUnlockedDetails(Array.isArray(data.details) ? data.details : []);
      setPhrase('');
      await refreshUser();
    } catch (err) {
      setProgressError(err.message || 'Unable to unlock secret.');
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
    setManageError('');
    try {
      await updateSecret(secretId, {
        title: draft.title,
        description: draft.description,
        keyword: draft.keyword,
        allowPhraseUnlock: draft.allowPhraseUnlock,
        ...(isAdmin ? { ownerId: draft.ownerId || null } : {}),
      });
      await refreshSecretUsers();
    } catch (err) {
      setManageError(err.message || 'Unable to save secret.');
    } finally {
      setSavingSecretId(null);
    }
  };

  const handleSecretCreate = async () => {
    setSavingSecretId('__new__');
    setManageError('');
    try {
      const created = await createSecret(newSecretDraft);
      setNewSecretDraft(EMPTY_SECRET_DRAFT);
      setSecretDrafts((prev) => ({
        ...prev,
        [created.id]: buildSecretDraft(created),
      }));
      await refreshSecretUsers();
    } catch (err) {
      setManageError(err.message || 'Unable to create secret.');
    } finally {
      setSavingSecretId(null);
    }
  };

  const handleSecretDelete = async (secretId) => {
    setDeletingSecretId(secretId);
    setManageError('');
    try {
      await deleteSecret(secretId);
      await refreshContent();
    } catch (err) {
      setManageError(err.message || 'Unable to delete secret.');
    } finally {
      setDeletingSecretId(null);
    }
  };

  const handleAssignmentToggle = async (userId, secretId, enabled) => {
    const key = `${userId}:${secretId}`;
    setAssignmentKey(key);
    setManageError('');
    try {
      if (enabled) {
        await revokeSecret(userId, secretId);
      } else {
        await grantSecret(userId, secretId);
      }
    } catch (err) {
      setManageError(err.message || 'Unable to update assignment.');
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
    const current = manageableEntries.find((entry) => String(entry.id) === String(entryId));
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
    setManageError('');
    try {
      await updateEntry(entryId, draft);
    } catch (err) {
      setManageError(err.message || 'Unable to save secret note.');
    } finally {
      setSavingEntryId(null);
    }
  };

  const handleEntryCreate = async () => {
    setSavingEntryId('__new__');
    setManageError('');
    try {
      await createEntry(newEntryDraft);
      setNewEntryDraft((prev) => ({
        ...EMPTY_CONTENT_DRAFT,
        secretId: prev.secretId,
      }));
    } catch (err) {
      setManageError(err.message || 'Unable to create secret note.');
    } finally {
      setSavingEntryId(null);
    }
  };

  const handleEntryDelete = async (entryId) => {
    setDeletingEntryId(entryId);
    setManageError('');
    try {
      await deleteEntry(entryId);
    } catch (err) {
      setManageError(err.message || 'Unable to delete secret note.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  if (!loading && !user && role === 'guest') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page-container progression progression--secrets">
      <header className="progression__header">
        <div>
          <p className="progression__eyebrow">Secrets</p>
          <h1>Hidden Threads</h1>
          <p className="progression__subtitle">
            Create secrets, own them, decide who can see them, and track which cities,
            regions, characters, and notes belong to each thread.
          </p>
        </div>
      </header>

      <section className="progression__stats">
        <article className="progression__stat">
          <span>Owned</span>
          <strong>{summary.owned}</strong>
        </article>
        <article className="progression__stat">
          <span>Visible</span>
          <strong>{summary.unlocked}</strong>
        </article>
        <article className="progression__stat">
          <span>Players with access</span>
          <strong>{summary.viewers}</strong>
        </article>
        <article className="progression__stat">
          <span>Linked world pieces</span>
          <strong>{summary.links}</strong>
        </article>
      </section>

      <section className="progression__admin-section">
        <div className="progression__section-head">
          <div>
            <p className="progression__eyebrow">Unlock</p>
            <h2>Secret Phrase</h2>
          </div>
          <p className="progression__muted">
            If a secret owner enables phrase unlocks, entering the phrase here reveals everything tied to that secret.
          </p>
        </div>

        <form className="progression__form" onSubmit={handleUnlock}>
          <input
            type="text"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder="Enter a secret phrase"
            disabled={!user}
          />
          <button type="submit" disabled={!user || unlocking || !phrase.trim()}>
            {unlocking ? 'Checking...' : 'Unlock Secret'}
          </button>
          {progressError && <p className="progression__error">{progressError}</p>}
        </form>

        {progressLoading && <p className="progression__muted">Loading your secrets...</p>}
        {!progressLoading && unlockedDetails.length > 0 && (
          <div className="progression__grid">
            {unlockedDetails.map((secret) => (
              <article key={secret.id} className="progression__card">
                <p className="progression__badge">{secret.canManage ? 'Managed' : 'Unlocked'}</p>
                <h3>{secret.title}</h3>
                <p>{secret.description}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {canCreateSecrets && (
        <section className="progression__admin-section">
          <div className="progression__section-head">
            <div>
              <p className="progression__eyebrow">Creation</p>
              <h2>Create a Secret</h2>
            </div>
            <p className="progression__muted">
              New secrets become yours by default. Use the secret scope controls on the map, atlas,
              and people editors to attach cities, regions, characters, and notes to them.
            </p>
          </div>

          {manageError && <p className="progression__error">{manageError}</p>}

          <article className="progression__card progression__card--editor">
            <div className="progression__card-edit">
              <label>
                <span>Title</span>
                <input
                  type="text"
                  value={newSecretDraft.title}
                  onChange={(event) =>
                    setNewSecretDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="The Gilded Horizon"
                />
              </label>
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
              {isAdmin && users.length > 0 && (
                <label>
                  <span>Owner</span>
                  <select
                    value={newSecretDraft.ownerId}
                    onChange={(event) =>
                      setNewSecretDraft((prev) => ({ ...prev, ownerId: event.target.value }))
                    }
                  >
                    <option value="">Assign to me</option>
                    {users.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name || entry.username || entry.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="progression__checkbox-label">
                <input
                  type="checkbox"
                  checked={newSecretDraft.allowPhraseUnlock}
                  onChange={(event) =>
                    setNewSecretDraft((prev) => ({
                      ...prev,
                      allowPhraseUnlock: event.target.checked,
                    }))
                  }
                />
                <span>Allow phrase unlock</span>
              </label>
              <label>
                <span>Unlock Phrase</span>
                <input
                  type="text"
                  value={newSecretDraft.keyword}
                  onChange={(event) =>
                    setNewSecretDraft((prev) => ({ ...prev, keyword: event.target.value }))
                  }
                  placeholder="Optional password phrase"
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  rows={3}
                  value={newSecretDraft.description}
                  onChange={(event) =>
                    setNewSecretDraft((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="What does this secret contain?"
                />
              </label>
              <div className="progression__card-actions">
                <button
                  type="button"
                  onClick={handleSecretCreate}
                  disabled={savingSecretId === '__new__' || !newSecretDraft.title.trim()}
                >
                  {savingSecretId === '__new__' ? 'Creating...' : 'Create Secret'}
                </button>
              </div>
            </div>
          </article>
        </section>
      )}

      {manageableSecrets.length > 0 && (
        <section className="progression__admin-section">
          <div className="progression__section-head">
            <div>
              <p className="progression__eyebrow">Control</p>
              <h2>Secrets You Manage</h2>
            </div>
            <p className="progression__muted">
              Owners control access, the phrase policy, and can track everything linked to their secret.
            </p>
          </div>

          <div className="progression__panel-grid">
            {manageableSecrets.map((secret) => {
              const draft = secretDrafts[secret.id] || buildSecretDraft(secret);
              const viewers = users.filter((entry) => entry.unlockedSecrets.includes(secret.id));
              return (
                <article key={secret.id} className="progression__card progression__card--editor">
                  <div className="progression__section-head">
                    <div>
                      <p className="progression__badge">{secret.isOwned ? 'Owner' : 'Managed'}</p>
                      <h3>{secret.title}</h3>
                    </div>
                    <div className="progression__meta">
                      <span>{secret.ownerName || 'No owner set'}</span>
                      <span>{secret.viewerCount} viewers</span>
                    </div>
                  </div>

                  <div className="progression__card-edit">
                    <label>
                      <span>Title</span>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(event) =>
                          handleSecretDraftChange(secret.id, 'title', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        onChange={(event) =>
                          handleSecretDraftChange(secret.id, 'description', event.target.value)
                        }
                      />
                    </label>
                    {isAdmin && (
                      <label>
                        <span>Owner</span>
                        <select
                          value={draft.ownerId || ''}
                          onChange={(event) =>
                            handleSecretDraftChange(secret.id, 'ownerId', event.target.value)
                          }
                        >
                          <option value="">No owner</option>
                          {users.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name || entry.username || entry.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="progression__checkbox-label">
                      <input
                        type="checkbox"
                        checked={draft.allowPhraseUnlock !== false}
                        onChange={(event) =>
                          handleSecretDraftChange(secret.id, 'allowPhraseUnlock', event.target.checked)
                        }
                      />
                      <span>Allow phrase unlock</span>
                    </label>
                    <label>
                      <span>Unlock Phrase</span>
                      <input
                        type="text"
                        value={draft.keyword || ''}
                        onChange={(event) =>
                          handleSecretDraftChange(secret.id, 'keyword', event.target.value)
                        }
                        placeholder="Optional password phrase"
                      />
                    </label>

                    <div className="progression__card-subsection">
                      <div className="progression__section-head">
                        <div>
                          <p className="progression__eyebrow">Access</p>
                          <h4>Who Can See This</h4>
                        </div>
                        <p className="progression__muted">
                          Owners and admins always retain access. Everyone else must be granted or unlock by phrase.
                        </p>
                      </div>
                      <div className="progression__viewer-list">
                        {loadingUsers ? (
                          <p className="progression__muted">Loading players...</p>
                        ) : users.length === 0 ? (
                          <p className="progression__muted">No player assignments available yet.</p>
                        ) : (
                          users.map((entry) => {
                            const enabled = entry.unlockedSecrets.includes(secret.id);
                            const key = `${entry.id}:${secret.id}`;
                            const isOwner = String(entry.id) === String(secret.ownerId);
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                className={`progression__secret-toggle ${enabled || isOwner ? 'is-active' : ''}`}
                                onClick={() => !isOwner && handleAssignmentToggle(entry.id, secret.id, enabled)}
                                disabled={assignmentKey === key || isOwner}
                              >
                                <span>{entry.name || entry.username || entry.email}</span>
                                <small>
                                  {isOwner
                                    ? 'Owner'
                                    : assignmentKey === key
                                      ? 'Saving...'
                                      : enabled
                                        ? 'Granted'
                                        : 'Locked'}
                                </small>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="progression__card-subsection">
                      <div className="progression__section-head">
                        <div>
                          <p className="progression__eyebrow">Linked World</p>
                          <h4>What This Secret Holds</h4>
                        </div>
                        <p className="progression__muted">
                          Attach more world items from <Link to="/atlas">Atlas</Link>, <Link to="/">Map</Link>, and <Link to="/people">People</Link> using the secret scope selector.
                        </p>
                      </div>
                      <div className="progression__stats progression__stats--compact">
                        <article className="progression__stat">
                          <span>Cities</span>
                          <strong>{secret.linkedCounts.locations}</strong>
                        </article>
                        <article className="progression__stat">
                          <span>Regions</span>
                          <strong>{secret.linkedCounts.regions}</strong>
                        </article>
                        <article className="progression__stat">
                          <span>Characters</span>
                          <strong>{secret.linkedCounts.npcs}</strong>
                        </article>
                        <article className="progression__stat">
                          <span>Notes</span>
                          <strong>{secret.linkedCounts.content}</strong>
                        </article>
                      </div>
                      <LinkedEntityList
                        title="Cities"
                        items={secret.linkedItems.locations}
                        renderItem={(item) => (
                          <Link key={item.id} className="progression__pill" to={`/location/${item.id}`}>
                            {item.name}
                          </Link>
                        )}
                      />
                      <LinkedEntityList
                        title="Regions"
                        items={secret.linkedItems.regions}
                        renderItem={(item) => (
                          <Link key={item.id} className="progression__pill" to={`/region/${item.id}`}>
                            {item.name}
                          </Link>
                        )}
                      />
                      <LinkedEntityList
                        title="Characters"
                        items={secret.linkedItems.npcs}
                        renderItem={(item) => (
                          <span key={item.id} className="progression__pill">
                            {item.name}
                          </span>
                        )}
                      />
                      <LinkedEntityList
                        title="Notes"
                        items={secret.linkedItems.content}
                        renderItem={(item) => (
                          <span key={item.id} className="progression__pill">
                            {item.title}
                          </span>
                        )}
                      />
                      {viewers.length > 0 && (
                        <div className="progression__linked-group">
                          <p className="progression__badge">Players Who Know It</p>
                          <div className="progression__linked-list">
                            {viewers.map((entry) => (
                              <span key={entry.id} className="progression__pill">
                                {entry.name || entry.username || entry.email}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

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
              );
            })}
          </div>
        </section>
      )}

      {manageableSecrets.length > 0 && (
        <section className="progression__admin-section">
          <div className="progression__section-head">
            <div>
              <p className="progression__eyebrow">Secret Notes</p>
              <h2>Information Stored On Site</h2>
            </div>
            <p className="progression__muted">
              These entries are part of the website itself. They only appear for the owner, admins,
              and players who have the matching secret unlocked.
            </p>
          </div>

          <div className="progression__panel-grid">
            <article className="progression__card progression__card--editor">
              <p className="progression__badge">New Secret Note</p>
              <div className="progression__card-edit">
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
                  <span>Secret</span>
                  <select
                    value={newEntryDraft.secretId || ''}
                    onChange={(event) =>
                      setNewEntryDraft((prev) => ({
                        ...prev,
                        secretId: event.target.value || null,
                      }))
                    }
                  >
                    {manageableSecrets.map((secret) => (
                      <option key={secret.id} value={secret.id}>
                        {secret.title}
                      </option>
                    ))}
                  </select>
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
                    disabled={savingEntryId === '__new__' || !newEntryDraft.secretId}
                  >
                    {savingEntryId === '__new__' ? 'Creating...' : 'Create Note'}
                  </button>
                </div>
              </div>
            </article>

            {manageableEntries.map((entry) => {
              const draft = entryDrafts[entry.id] || buildContentDraft(entry);
              return (
                <article key={entry.id} className="progression__card progression__card--editor">
                  <p className="progression__badge">
                    {getSecretById(draft.secretId)?.title || draft.secretId || 'Secret note'}
                  </p>
                  <div className="progression__card-edit">
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
                      <span>Secret</span>
                      <select
                        value={draft.secretId || ''}
                        onChange={(event) =>
                          handleEntryDraftChange(entry.id, 'secretId', event.target.value || null)
                        }
                      >
                        {manageableSecrets.map((secret) => (
                          <option key={secret.id} value={secret.id}>
                            {secret.title}
                          </option>
                        ))}
                      </select>
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
      )}

      {discoveredSecrets.length > 0 && (
        <section className="progression__admin-section">
          <div className="progression__section-head">
            <div>
              <p className="progression__eyebrow">Discovered</p>
              <h2>Unlocked Secrets</h2>
            </div>
            <p className="progression__muted">
              These are visible to you, but owned by someone else.
            </p>
          </div>
          <div className="progression__grid">
            {discoveredSecrets.map((secret) => (
              <article key={secret.id} className="progression__card">
                <p className="progression__badge">Unlocked</p>
                <h3>{secret.title}</h3>
                <p>{secret.description}</p>
                <p className="progression__muted">
                  Owner: {secret.ownerName || 'Unknown'} · Cities {secret.linkedCounts.locations} · Regions {secret.linkedCounts.regions} · Characters {secret.linkedCounts.npcs}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
