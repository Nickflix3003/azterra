import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = '/api';
const TYPES = [
  { id: 'players', label: 'Player Characters' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'majors', label: 'Major Entities' },
];

function AdminEntitiesPage() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [type, setType] = useState('players');
  const [items, setItems] = useState([]);
  const [regions, setRegions] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    id: '',
    name: '',
    description: '',
    entityType: '',
    campaign: 'Main',
    regionId: '',
    markerId: '',
    image: '',
    visible: true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/entities/${type}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load.');
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Unable to load.');
    }
  };

  useEffect(() => {
    load();
  }, [type, user]);

  useEffect(() => {
    const fetchRefs = async () => {
      if (!user) return;
      try {
        const resRegions = await fetch(`${API_BASE_URL}/regions`);
        const dataRegions = await resRegions.json();
        if (resRegions.ok) setRegions(dataRegions.regions || []);
        const resLocs = await fetch(`${API_BASE_URL}/locations`);
        const dataLocs = await resLocs.json();
        if (resLocs.ok) setMarkers(dataLocs.locations || []);
        if (resLocs.ok) setLocations(dataLocs.locations || []);
      } catch {
        /* ignore */
      }
    };
    fetchRefs();
  }, [user]);

  if (!isAdmin) {
    return (
      <div className="page-container">
        <h1>Admin Entities</h1>
        <p>You must be an admin to manage entities.</p>
      </div>
    );
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/entities/${type}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save.');
      setForm({
        id: '',
        name: '',
        description: '',
        entityType: '',
        campaign: 'Main',
        regionId: '',
        markerId: '',
        image: '',
        visible: true,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Unable to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <h1>Admin Entities</h1>
      <div className="characters-tabs">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${type === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form className="list-panel" onSubmit={handleSave}>
        <div className="account-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="account-field">
          <span>Description</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
        <div className="account-field">
          <span>Type / Role</span>
          <input value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} />
        </div>
        <div className="account-field">
          <span>Campaign</span>
          <input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
        </div>
        <div className="account-field">
          <span>Region</span>
          <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
            <option value="">— None —</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name || region.id}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <span>Marker</span>
          <select value={form.markerId} onChange={(e) => setForm({ ...form, markerId: e.target.value })}>
            <option value="">— None —</option>
            {markers.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name || loc.id}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <span>Linked Location</span>
          <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
            <option value="">— None —</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name || loc.id}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <span>Image URL</span>
          <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        </div>
        <label className="visibility-toggle">
          <input
            type="checkbox"
            checked={form.visible}
            onChange={(e) => setForm({ ...form, visible: e.target.checked })}
          />
          <span>Visible</span>
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Entity'}
        </button>
        {error && <p className="account-error">{error}</p>}
      </form>

      <div className="view-grid">
        {items.map((item) => (
          <div key={item.id} className="view-card">
            <div className="view-card__header">
              <div>
                <p className="account-card__eyebrow">{item.entityType || type}</p>
                <h3>{item.name}</h3>
              </div>
              <label className="visibility-toggle">
                <input
                  type="checkbox"
                  checked={item.visible !== false}
                  onChange={async () => {
                    await fetch(`${API_BASE_URL}/entities/${type}/visibility`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include',
                      body: JSON.stringify({ id: item.id, visible: !(item.visible === false) }),
                    });
                    load();
                  }}
                />
                <span>{item.visible === false ? 'Hidden' : 'Visible'}</span>
              </label>
            </div>
        <p className="account-muted">{item.description}</p>
        <p className="account-muted">Campaign: {item.campaign || 'Main'}</p>
        <p className="account-muted">Region: {item.regionId || '—'} | Marker: {item.markerId || '—'}</p>
        <p className="account-muted">Location: {item.locationId || '—'}</p>
        <button
          type="button"
          className="fav-btn"
          onClick={() => setForm({ ...form, ...item })}
        >
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminEntitiesPage;
