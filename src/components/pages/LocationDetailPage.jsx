import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../UI/PageUI.css';

const API_BASE_URL = '/api';

function LocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/view/location/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to load location');
        setData(json);
      } catch (err) {
        setError(err.message || 'Unable to load location');
      }
    };
    load();
  }, [id]);

  if (error) {
    return (
      <div className="page-container">
        <h1>Location</h1>
        <p className="account-error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page-container">
        <h1>Location</h1>
        <p className="account-muted">Loading...</p>
      </div>
    );
  }

  const { location, npcs, players, majors } = data;

  return (
    <div className="page-container">
      <h1>{location?.name || 'Location'}</h1>
      <p className="account-muted">{location?.description || 'No description provided.'}</p>
      <p className="account-muted">Campaign: {location?.campaign || 'Main'}</p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {location?.hasLocalMap && (
          <button
            type="button"
            className="tab-btn"
            onClick={() => navigate(`/location/${location.id}/map`)}
          >
            Open Local Map
          </button>
        )}
        <button
          type="button"
          className="tab-btn"
          onClick={() => navigate(`/atlas?loc=${location.id}`)}
        >
          Open in Atlas
        </button>
        <button
          type="button"
          className="tab-btn"
          onClick={() => navigate('/people')}
        >
          View in Viewer Page
        </button>
      </div>

      <div className="view-grid">
        <div className="view-card">
          <h3>NPCs</h3>
          {npcs?.length ? npcs.map((n) => <p key={n.id}>{n.name}</p>) : <p className="account-muted">None linked.</p>}
        </div>
        <div className="view-card">
          <h3>Players</h3>
          {players?.length ? players.map((p) => <p key={p.id}>{p.name}</p>) : <p className="account-muted">None linked.</p>}
        </div>
        <div className="view-card">
          <h3>Major Entities</h3>
          {majors?.length ? majors.map((m) => <p key={m.id}>{m.name}</p>) : <p className="account-muted">None linked.</p>}
        </div>
      </div>
    </div>
  );
}

export default LocationDetailPage;
