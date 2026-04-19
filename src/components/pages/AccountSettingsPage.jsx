import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = '/api';

const ROLE_CONFIG = {
  admin:   { label: 'Admin',   color: '#ffd700', bg: 'rgba(255,215,0,0.12)',   border: 'rgba(255,215,0,0.4)'   },
  editor:  { label: 'Editor',  color: '#7dd3fc', bg: 'rgba(125,211,252,0.1)',  border: 'rgba(125,211,252,0.35)' },
  pending: { label: 'Pending', color: '#fca5a5', bg: 'rgba(252,165,165,0.1)',  border: 'rgba(252,165,165,0.35)' },
  guest:   { label: 'Guest',   color: '#a8a29e', bg: 'rgba(168,162,158,0.1)', border: 'rgba(168,162,158,0.3)'  },
};

function SecretModal({ secret, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="secret-modal-overlay" onClick={onClose}>
      <div className="secret-modal" onClick={(e) => e.stopPropagation()}>
        <button className="secret-modal__close" onClick={onClose} aria-label="Close">✕</button>
        <div className="secret-modal__icon">🔓</div>
        <p className="secret-modal__eyebrow">Secret Unlocked</p>
        <h2 className="secret-modal__title">{secret.title}</h2>
        <p className="secret-modal__desc">{secret.description}</p>
        <div className="secret-modal__footer">
          <span className="secret-list__badge">Unlocked</span>
        </div>
      </div>
    </div>
  );
}

function AccountSettingsPage() {
  const { user, role, updateAccount, refreshUser } = useAuth();

  // Profile fields
  const [username, setUsername]         = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [bio, setBio]                   = useState('');
  const [labelOne, setLabelOne]         = useState('');
  const [labelTwo, setLabelTwo]         = useState('');
  const [documents, setDocuments]       = useState([]);

  // Save state
  const [saving, setSaving]       = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError]   = useState('');

  // File upload state
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Secrets state
  const [phrase, setPhrase]               = useState('');
  const [unlocking, setUnlocking]         = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [_unlockedSecrets, setUnlockedSecrets] = useState([]);
  const [secretDetails, setSecretDetails] = useState([]);
  const [expandedSecret, setExpandedSecret] = useState(null);

  // Image preview validity
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setUsername(user?.username || '');
    setProfilePicture(user?.profilePicture || '');
    setBio(user?.profile?.bio || '');
    setLabelOne(user?.profile?.labelOne || '');
    setLabelTwo(user?.profile?.labelTwo || '');
    setDocuments(Array.isArray(user?.profile?.documents) ? user.profile.documents : []);
    setImgError(false);
  }, [user]);

  // Reset imgError when URL changes
  useEffect(() => { setImgError(false); }, [profilePicture]);

  const avatarFallback = useMemo(() => {
    const seed = user?.username || user?.name || user?.email || '?';
    return seed.charAt(0).toUpperCase();
  }, [user]);

  const generateAvatarUrl = () => {
    const seed = (username || avatarFallback || 'azterra').replace(/\s+/g, '-');
    return `https://api.dicebear.com/9.x/fantasy/svg?seed=${encodeURIComponent(seed)}`;
  };

  const fetchProgress = async () => {
    if (!user) return;
    setProgressLoading(true);
    setProgressError('');
    try {
      const res = await fetch(`${API_BASE_URL}/secrets/progress`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load secret progress.');
      setUnlockedSecrets(data.unlocked || []);
      setSecretDetails(data.details || []);
    } catch (err) {
      setProgressError(err.message || 'Unable to load secret progress.');
    } finally {
      setProgressLoading(false);
    }
  };

  useEffect(() => { fetchProgress(); }, [user]);

  if (!user) {
    return (
      <div className="page-container">
        <h1>Account Settings</h1>
        <p>You need to be logged in to view your account.</p>
      </div>
    );
  }

  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.guest;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      await updateAccount({
        username,
        profilePicture,
        profile: { bio, labelOne, labelTwo },
      });
      setSaveMessage('Saved successfully.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveError(err.message || 'Unable to update account.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAvatar = () => {
    setProfilePicture(generateAvatarUrl());
    setSaveMessage('');
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!phrase.trim()) return;
    setUnlocking(true);
    setProgressError('');
    try {
      const res = await fetch(`${API_BASE_URL}/secrets/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phrase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to check secret.');
      setUnlockedSecrets(data.unlocked || []);
      setSecretDetails(data.details || []);
      setPhrase('');
      await refreshUser();
    } catch (err) {
      setProgressError(err.message || 'Unable to check secret.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const res = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to upload files.');
      setDocuments(data.documents || []);
      await refreshUser();
      e.target.value = '';
    } catch (err) {
      setUploadError(err.message || 'Unable to upload files.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (id) => {
    if (!user) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await fetch(`${API_BASE_URL}/files/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to remove file.');
      setDocuments(data.documents || []);
      await refreshUser();
    } catch (err) {
      setUploadError(err.message || 'Unable to remove file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    if (!user || !doc?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/files/download/${doc.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Unable to download file.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError(err.message || 'Unable to download file.');
    }
  };

  const showAvatar = profilePicture && !imgError;

  return (
    <div className="page-container acct-layout">

      {/* ── LEFT: Profile ─────────────────────────────────────── */}
      <div className="acct-col acct-col--profile">

        {/* Avatar hero */}
        <div className="acct-avatar-hero">
          <div className="acct-avatar-lg">
            {showAvatar
              ? <img src={profilePicture} alt="Profile" onError={() => setImgError(true)} />
              : <span>{avatarFallback}</span>
            }
          </div>
          <div className="acct-identity">
            <p className="acct-name">{username || user.name || 'Unnamed Adventurer'}</p>
            <span
              className="acct-role-badge"
              style={{ color: roleConfig.color, background: roleConfig.bg, borderColor: roleConfig.border }}
            >
              {roleConfig.label}
            </span>
            {labelOne && <p className="acct-label">{labelOne}</p>}
            {labelTwo && <p className="acct-label acct-label--dim">{labelTwo}</p>}
          </div>
        </div>

        {/* Profile form */}
        <form className="acct-form" onSubmit={handleSave}>
          <p className="acct-section-eyebrow">Profile</p>

          <div className="acct-field">
            <label htmlFor="acct-username">Display Name</label>
            <input
              id="acct-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Pick a name for the world to know you by"
            />
          </div>

          <div className="acct-field">
            <label htmlFor="acct-bio">Bio</label>
            <textarea
              id="acct-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the world your story..."
              rows={3}
            />
          </div>

          <div className="acct-field-row">
            <div className="acct-field">
              <label htmlFor="acct-label1">Adventurer's Title</label>
              <input
                id="acct-label1"
                type="text"
                value={labelOne}
                onChange={(e) => setLabelOne(e.target.value)}
                placeholder="e.g. Rogue of the Silver Hand"
              />
            </div>
            <div className="acct-field">
              <label htmlFor="acct-label2">Faction / Origin</label>
              <input
                id="acct-label2"
                type="text"
                value={labelTwo}
                onChange={(e) => setLabelTwo(e.target.value)}
                placeholder="e.g. The Iron Veil"
              />
            </div>
          </div>

          <p className="acct-section-eyebrow" style={{ marginTop: '0.5rem' }}>Profile Picture</p>

          <div className="acct-pfp-row">
            <div className="acct-pfp-thumb">
              {showAvatar
                ? <img src={profilePicture} alt="" onError={() => setImgError(true)} />
                : <span>{avatarFallback}</span>
              }
            </div>
            <div className="acct-field acct-field--grow">
              <label htmlFor="acct-pfp">Image URL</label>
              <input
                id="acct-pfp"
                type="url"
                value={profilePicture}
                onChange={(e) => setProfilePicture(e.target.value)}
                placeholder="https://..."
              />
              {imgError && profilePicture && (
                <p className="acct-muted" style={{ color: '#f87171', marginTop: '0.25rem' }}>
                  Image failed to load. Check the URL.
                </p>
              )}
              <div className="acct-pfp-actions">
                <button type="button" className="acct-btn acct-btn--ghost" onClick={handleGenerateAvatar}>
                  ✦ Generate Avatar
                </button>
                {profilePicture && (
                  <button type="button" className="acct-btn acct-btn--ghost acct-btn--danger" onClick={() => setProfilePicture('')}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="acct-save-row">
            <button type="submit" className="acct-btn acct-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saveMessage && <span className="acct-feedback acct-feedback--ok">{saveMessage}</span>}
            {saveError   && <span className="acct-feedback acct-feedback--err">{saveError}</span>}
          </div>
        </form>
      </div>

      {/* ── RIGHT: Info + Docs + Secrets ──────────────────────── */}
      <div className="acct-col acct-col--right">

        {/* Account info chips */}
        <div className="acct-card">
          <p className="acct-section-eyebrow">Account</p>
          <div className="acct-info-rows">
            <div className="acct-info-row">
              <span className="acct-info-label">Email</span>
              <span className="acct-info-value">{user.email}</span>
            </div>
            <div className="acct-info-row">
              <span className="acct-info-label">Permission</span>
              <span
                className="acct-role-badge"
                style={{ color: roleConfig.color, background: roleConfig.bg, borderColor: roleConfig.border }}
              >
                {roleConfig.label}
              </span>
            </div>
            {user.provider && (
              <div className="acct-info-row">
                <span className="acct-info-label">Auth</span>
                <span className="acct-info-value acct-info-value--muted">{user.provider}</span>
              </div>
            )}
          </div>
        </div>

        {/* Documents */}
        <div className="acct-card">
          <p className="acct-section-eyebrow">Documents</p>
          <label className="acct-upload-btn">
            <input
              type="file"
              accept=".pdf,text/plain"
              multiple
              onChange={handleUpload}
              disabled={!user || uploading}
              style={{ display: 'none' }}
            />
            <span className="acct-btn acct-btn--ghost" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {uploading ? 'Uploading…' : '+ Upload PDF or Text'}
            </span>
          </label>
          {uploadError && <p className="acct-feedback acct-feedback--err">{uploadError}</p>}

          {documents.length === 0 ? (
            <p className="acct-muted" style={{ marginTop: '0.5rem' }}>No documents uploaded yet.</p>
          ) : (
            <ul className="acct-doc-list">
              {documents.map((doc) => (
                <li key={doc.id} className="acct-doc-item">
                  <div className="acct-doc-icon">📄</div>
                  <div className="acct-doc-info">
                    <p className="acct-doc-name">{doc.originalName}</p>
                    <p className="acct-muted">{(doc.size / 1024).toFixed(1)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="acct-doc-actions">
                    <button className="acct-btn acct-btn--ghost acct-btn--sm" onClick={() => handleDownload(doc)} disabled={uploading}>↓</button>
                    <button className="acct-btn acct-btn--ghost acct-btn--danger acct-btn--sm" onClick={() => handleDeleteDoc(doc.id)} disabled={uploading}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Secrets */}
        <div className="acct-card acct-card--secrets">
          <p className="acct-section-eyebrow">Secrets</p>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>Secret Unlocks</h2>
          <p className="acct-muted" style={{ marginBottom: '1rem' }}>Whisper the right words to reveal hidden lore.</p>

          <form className="acct-unlock-form" onSubmit={handleUnlock}>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Speak the phrase..."
              required
            />
            <button type="submit" className="acct-btn acct-btn--primary" disabled={unlocking || !phrase.trim()}>
              {unlocking ? '…' : 'Unlock'}
            </button>
          </form>
          {progressError && <p className="acct-feedback acct-feedback--err" style={{ marginTop: '0.5rem' }}>{progressError}</p>}

          <div className="acct-secrets-progress">
            {progressLoading && <p className="acct-muted">Loading…</p>}
            {!progressLoading && secretDetails.length === 0 && (
              <div className="acct-secrets-empty">
                <span className="acct-secrets-empty__icon">🔒</span>
                <p>No secrets unlocked yet.</p>
                <p className="acct-muted">Keep exploring Azterra to find the phrases.</p>
              </div>
            )}
            {secretDetails.length > 0 && (
              <div className="acct-secrets-grid">
                {secretDetails.map((secret) => (
                  <button
                    key={secret.id}
                    className="acct-secret-card"
                    onClick={() => setExpandedSecret(secret)}
                    title="Click to reveal"
                  >
                    <div className="acct-secret-card__glyph">🔓</div>
                    <p className="acct-secret-card__title">{secret.title}</p>
                    <p className="acct-secret-card__hint">Click to reveal</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Secret expanded modal */}
      {expandedSecret && (
        <SecretModal secret={expandedSecret} onClose={() => setExpandedSecret(null)} />
      )}
    </div>
  );
}

export default AccountSettingsPage;
