import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../UI/PageUI.css';

const API_BASE_URL = '/api';

function RegionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/view/region/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to load region');
        setData(json);
      } catch (err) {
        setError(err.message || 'Unable to load region');
      }
    };
    load();
  }, [id]);

  if (error) {
    return (
      <div className="page-container">
        <h1>Region</h1>
        <p className="account-error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page-container">
        <h1>Region</h1>
        <p className="account-muted">Loading...</p>
      </div>
    );
  }

  const { region, locations, npcs, players, majors } = data;

  return (
    <div className="page-container">
      <h1>{region?.name || 'Region'}</h1>
      <p className="account-muted">Category: {region?.category || '—'}</p>
      <p className="account-muted">Campaign: {region?.campaign || 'Main'}</p>
      <button
        type="button"
        className="tab-btn"
        onClick={() => navigate('/people')}
      >
        View in Viewer Page
      </button>

      <div className="view-grid">
        <div className="view-card">
          <h3>Locations</h3>
          {locations?.length ? locations.map((loc) => <p key={loc.id}>{loc.name}</p>) : <p className="account-muted">None linked.</p>}
        </div>
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

export default RegionDetailPage;
