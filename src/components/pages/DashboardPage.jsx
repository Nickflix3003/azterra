import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import characters from '../../data/characters_heroes';

const API_BASE_URL = '/api';

function DashboardPage() {
  const { user } = useAuth();
  const [progress, setProgress] = useState({ unlocked: [], details: [] });
  const [favorites, setFavorites] = useState([]);
  const [visibleIds, setVisibleIds] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [error, _setError] = useState('');

  const charMap = useMemo(() => {
    const map = new Map();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  useEffect(() => {
    const loadProgress = async () => {
      if (!user) return;
      try {
        const res = await fetch(`${API_BASE_URL}/secrets/progress`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) setProgress({ unlocked: data.unlocked || [], details: data.details || [] });
      } catch {
        /* ignore */
      }
    };
    const loadFavorites = async () => {
      if (!user) return;
      try {
        const visRes = await fetch(`${API_BASE_URL}/characters/visible`);
        const visData = await visRes.json();
        if (visRes.ok && Array.isArray(visData.visibleIds)) {
          setVisibleIds(visData.visibleIds);
        }
        const res = await fetch(`${API_BASE_URL}/characters/me`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
      } catch {
        /* ignore */
      }
    };
    const loadDocs = async () => {
      if (!user) return;
      try {
        const res = await fetch(`${API_BASE_URL}/files/list`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) setDocuments(Array.isArray(data.documents) ? data.documents : []);
      } catch {
        /* ignore */
      }
    };
    loadProgress();
    loadFavorites();
    loadDocs();
  }, [user]);

  if (!user) {
    return (
      <div className="page-container">
        <h1>Dashboard</h1>
        <p>Please log in to view your dashboard.</p>
      </div>
    );
  }

  const favoriteCards = favorites
    .filter((id) => visibleIds.includes(id))
    .map((id) => charMap.get(id))
    .filter(Boolean);

  return (
    <div className="page-container">
      <div className="dashboard-hero">
        <div className="dashboard-avatar">
          {user.profilePicture ? <img src={user.profilePicture} alt="" /> : <span>{(user.username || user.email || '?')[0]}</span>}
        </div>
        <div>
          <p className="account-card__eyebrow">Profile</p>
          <h1>{user.username || user.name || 'User'}</h1>
          <p className="account-card__subtitle">{user.profile?.bio || 'No bio yet.'}</p>
          <div className="dashboard-labels">
            {user.profile?.labelOne && <span className="tag">{user.profile.labelOne}</span>}
            {user.profile?.labelTwo && <span className="tag">{user.profile.labelTwo}</span>}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <header>
            <h3>Unlocked Secrets</h3>
          </header>
          {progress.details.length === 0 ? (
            <p className="account-muted">No secrets unlocked yet.</p>
          ) : (
            <ul className="simple-list">
              {progress.details.map((secret) => (
                <li key={secret.id}>{secret.title}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-card">
          <header>
            <h3>Favorites</h3>
          </header>
          {favoriteCards.length === 0 ? (
            <p className="account-muted">No favorites selected.</p>
          ) : (
            <ul className="simple-list">
              {favoriteCards.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-card">
          <header>
            <h3>Documents</h3>
          </header>
          {documents.length === 0 ? (
            <p className="account-muted">No uploads yet.</p>
          ) : (
            <ul className="simple-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <strong>{doc.originalName}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {error && <p className="account-error">{error}</p>}
    </div>
  );
}

export default DashboardPage;
