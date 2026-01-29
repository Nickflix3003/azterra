import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function AccountSettingsPage() {
  const { user, role, updateAccount, refreshUser } = useAuth();
  const [username, setUsername] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [bio, setBio] = useState('');
  const [labelOne, setLabelOne] = useState('');
  const [labelTwo, setLabelTwo] = useState('');
  const [documents, setDocuments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [phrase, setPhrase] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [_unlockedSecrets, setUnlockedSecrets] = useState([]);
  const [secretDetails, setSecretDetails] = useState([]);

  useEffect(() => {
    setUsername(user?.username || '');
    setProfilePicture(user?.profilePicture || '');
    setBio(user?.profile?.bio || '');
    setLabelOne(user?.profile?.labelOne || '');
    setLabelTwo(user?.profile?.labelTwo || '');
    setDocuments(Array.isArray(user?.profile?.documents) ? user.profile.documents : []);
  }, [user]);

  const avatarFallback = useMemo(() => {
    const seed = user?.username || user?.googleName || user?.name || user?.email || '?';
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
      const response = await fetch(`${API_BASE_URL}/secrets/progress`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load secret progress.');
      }
      setUnlockedSecrets(data.unlocked || []);
      setSecretDetails(data.details || []);
    } catch (err) {
      setProgressError(err.message || 'Unable to load secret progress.');
    } finally {
      setProgressLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [user]);

  if (!user) {
    return (
      <div className="page-container">
        <h1>Account Settings</h1>
        <p>You need to be logged in to view your account.</p>
      </div>
    );
  }

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage('');
    setError('');
    try {
      await updateAccount({
        username,
        profilePicture,
        profile: {
          bio,
          labelOne,
          labelTwo,
        },
      });
      setSaveMessage('Account updated.');
    } catch (err) {
      setError(err.message || 'Unable to update account.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAvatar = () => {
    setProfilePicture(generateAvatarUrl());
    setSaveMessage('');
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!phrase.trim()) return;
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

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !user) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const res = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to upload files.');
      }
      setDocuments(data.documents || []);
      await refreshUser();
      event.target.value = '';
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
      if (!res.ok) {
        throw new Error(data.error || 'Unable to remove file.');
      }
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
      const res = await fetch(`${API_BASE_URL}/files/download/${doc.id}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Unable to download file.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.originalName || 'file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError(err.message || 'Unable to download file.');
    }
  };

  return (
    <div className="page-container account-grid">
      <div className="account-card">
        <header className="account-card__header">
          <div>
            <p className="account-card__eyebrow">Account</p>
            <h1>Account Settings</h1>
            <p className="account-card__subtitle">Personalize your presence and see your permissions.</p>
          </div>
          <div className="account-avatar">
            {profilePicture ? (
              <img src={profilePicture} alt="Profile" />
            ) : (
              <span>{avatarFallback}</span>
            )}
          </div>
        </header>

        <form className="account-form" onSubmit={handleSave}>
          <label className="account-field">
            <span>Email</span>
            <input type="email" value={user.email} disabled />
          </label>
          <label className="account-field">
            <span>Permission Level</span>
            <input type="text" value={role} disabled />
          </label>
          <label className="account-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Pick a display name"
            />
          </label>
          <label className="account-field">
            <span>Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write a short bio"
              rows={4}
            />
          </label>
          <label className="account-field">
            <span>Label One</span>
            <input
              type="text"
              value={labelOne}
              onChange={(e) => setLabelOne(e.target.value)}
              placeholder="Optional label"
            />
          </label>
          <label className="account-field">
            <span>Label Two</span>
            <input
              type="text"
              value={labelTwo}
              onChange={(e) => setLabelTwo(e.target.value)}
              placeholder="Optional label"
            />
          </label>
          <label className="account-field">
            <span>Profile Picture URL</span>
            <input
              type="url"
              value={profilePicture}
              onChange={(e) => setProfilePicture(e.target.value)}
              placeholder="https://..."
            />
            <div className="account-field__actions">
              <button type="button" onClick={handleGenerateAvatar}>
                Generate Avatar
              </button>
              <button type="button" onClick={() => setProfilePicture('')}>
                Clear
              </button>
            </div>
          </label>
          <div className="account-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saveMessage && <span className="account-message">{saveMessage}</span>}
            {error && <span className="account-error">{error}</span>}
          </div>
        </form>

        <section className="account-upload">
          <div className="account-field">
            <span>Upload documents (PDF or text)</span>
            <input type="file" accept=".pdf,text/plain" multiple onChange={handleUpload} disabled={!user || uploading} />
            {uploadError && <p className="account-error">{uploadError}</p>}
            {uploading && <p className="account-muted">Uploading...</p>}
          </div>
          <div className="list-panel">
            <h3>Your uploads</h3>
            {(!documents || !documents.length) && <p className="account-muted">No documents uploaded.</p>}
            {documents && documents.length > 0 && (
              <ul className="simple-list">
                {documents.map((doc) => (
                  <li key={doc.id} className="upload-row">
                  <div>
                    <strong>{doc.originalName}</strong>
                    <p className="account-muted">
                      {(doc.size / 1024).toFixed(1)} KB · {new Date(doc.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="upload-actions">
                    <button type="button" onClick={() => handleDownload(doc)} disabled={uploading}>
                      Download
                    </button>
                    <button type="button" onClick={() => handleDeleteDoc(doc.id)} disabled={uploading}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </section>
      </div>

      <div className="account-card">
        <header className="account-card__header">
          <div>
            <p className="account-card__eyebrow">Secrets</p>
            <h2>Secret Unlocks</h2>
            <p className="account-card__subtitle">Enter phrases to reveal hidden lore and progression.</p>
          </div>
        </header>

        <form className="account-form" onSubmit={handleUnlock}>
          <label className="account-field">
            <span>Secret Phrase</span>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Whisper a phrase..."
              required
            />
          </label>
          <button type="submit" disabled={unlocking || !phrase.trim()}>
            {unlocking ? 'Checking...' : 'Unlock'}
          </button>
          {progressError && <p className="account-error">{progressError}</p>}
        </form>

        <div className="account-progress">
          <div className="account-progress__header">
            <h3>Progress</h3>
            {progressLoading && <span className="account-message">Loading...</span>}
          </div>
          {secretDetails.length === 0 && !progressLoading ? (
            <p className="account-muted">No secrets unlocked yet.</p>
          ) : (
            <ul className="secret-list">
              {secretDetails.map((secret) => (
                <li key={secret.id} className="secret-list__item">
                  <div>
                    <p className="secret-list__title">{secret.title}</p>
                    <p className="secret-list__desc">{secret.description}</p>
                  </div>
                  <span className="secret-list__badge">Unlocked</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountSettingsPage;
