import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import './PeoplePage.css';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statLabel(key) {
  return { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[key] || key;
}
function mod(v) { const m = Math.floor((v - 10) / 2); return (m >= 0 ? '+' : '') + m; }

// ── HeroCard ─────────────────────────────────────────────────────────────────

function HeroCard({ hero, isAdmin, isEditMode, locations }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const cardRef = useRef(null);

  const d = draft || hero;

  const set = (field, val) => setDraft(prev => ({ ...(prev || hero), [field]: val }));

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API}/heroes/${hero.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: d.name, title: d.title, race: d.race, class: d.class,
          subclass: d.subclass, level: d.level, hp: d.hp, ac: d.ac,
          speed: d.speed, alignment: d.alignment, notes: d.notes, lore: d.lore,
          abilities: d.abilities, spells: d.spells, equipment: d.equipment,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
      setMsg('Saved!');
      setDraft(null);
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const color = hero.color || '#facc15';

  return (
    <div
      ref={cardRef}
      className={`pp-card pp-card--hero ${open ? 'pp-card--open' : ''}`}
      style={{ '--hero-color': color }}
    >
      <div className="pp-card__header" role="button" tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(v => !v)}
      >
        <div className="pp-card__title-row">
          <span className="pp-card__accent" />
          <div>
            <p className="pp-card__eyebrow">{d.title || (d.race + ' ' + d.class)}</p>
            <h3 className="pp-card__name">{d.name}</h3>
          </div>
        </div>
        <div className="pp-card__meta-row">
          {d.class && <span className="pp-badge">{d.class}{d.subclass ? ` · ${d.subclass}` : ''}</span>}
          {d.level != null && <span className="pp-badge pp-badge--gold">Lv. {d.level}</span>}
          <span className="pp-card__chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="pp-card__body" onClick={e => e.stopPropagation()}>
          {/* Stats row */}
          {d.stats && (
            <div className="pp-section">
              <p className="pp-section__label">Stats</p>
              <div className="pp-stats-grid">
                {Object.entries(d.stats).map(([k, v]) => (
                  <div key={k} className="pp-stat">
                    <span className="pp-stat__val">{v}</span>
                    <span className="pp-stat__mod">{mod(v)}</span>
                    <span className="pp-stat__key">{statLabel(k)}</span>
                  </div>
                ))}
              </div>
              <div className="pp-inline-stats">
                {d.hp != null && <span><strong>HP</strong> {d.hp}</span>}
                {d.ac != null && <span><strong>AC</strong> {d.ac}</span>}
                {d.speed != null && <span><strong>Speed</strong> {d.speed} ft</span>}
                {d.passivePerception != null && <span><strong>PP</strong> {d.passivePerception}</span>}
              </div>
            </div>
          )}

          {/* Abilities */}
          {(d.abilities?.length > 0 || isEditMode) && (
            <div className="pp-section">
              <p className="pp-section__label">Abilities</p>
              {isEditMode ? (
                <textarea className="pp-textarea" rows={5}
                  value={Array.isArray(d.abilities) ? d.abilities.join('\n') : (d.abilities || '')}
                  onChange={e => set('abilities', e.target.value.split('\n'))} />
              ) : (
                <ul className="pp-list">
                  {(Array.isArray(d.abilities) ? d.abilities : [d.abilities]).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Spells */}
          {(d.spells?.length > 0 || isEditMode) && (
            <div className="pp-section">
              <p className="pp-section__label">Spells</p>
              {isEditMode ? (
                <textarea className="pp-textarea" rows={4}
                  value={Array.isArray(d.spells) ? d.spells.join('\n') : (d.spells || '')}
                  onChange={e => set('spells', e.target.value.split('\n'))} />
              ) : (
                <div className="pp-tag-list">
                  {(Array.isArray(d.spells) ? d.spells : []).map((s, i) => (
                    <span key={i} className="pp-tag">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Equipment */}
          {(d.equipment?.length > 0 || isEditMode) && (
            <div className="pp-section">
              <p className="pp-section__label">Equipment</p>
              {isEditMode ? (
                <textarea className="pp-textarea" rows={4}
                  value={Array.isArray(d.equipment) ? d.equipment.join('\n') : (d.equipment || '')}
                  onChange={e => set('equipment', e.target.value.split('\n'))} />
              ) : (
                <ul className="pp-list pp-list--compact">
                  {(Array.isArray(d.equipment) ? d.equipment : []).map((eq, i) => (
                    <li key={i}>{eq}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Lore */}
          <div className="pp-section">
            <p className="pp-section__label">Lore</p>
            {isEditMode ? (
              <textarea className="pp-textarea pp-textarea--lore" rows={6}
                value={d.lore || ''}
                onChange={e => set('lore', e.target.value)} />
            ) : (
              d.lore
                ? <p className="pp-lore-text">{d.lore}</p>
                : <p className="pp-empty">No lore added yet.</p>
            )}
          </div>

          {/* Notes */}
          {(d.notes || isEditMode) && (
            <div className="pp-section">
              <p className="pp-section__label">Notes</p>
              {isEditMode ? (
                <textarea className="pp-textarea" rows={3}
                  value={d.notes || ''}
                  onChange={e => set('notes', e.target.value)} />
              ) : (
                <p className="pp-notes-text">{d.notes}</p>
              )}
            </div>
          )}

          {/* Edit fields */}
          {isEditMode && (
            <div className="pp-section pp-edit-grid">
              <label className="pp-field">
                <span>Name</span>
                <input value={d.name || ''} onChange={e => set('name', e.target.value)} />
              </label>
              <label className="pp-field">
                <span>Title</span>
                <input value={d.title || ''} onChange={e => set('title', e.target.value)} />
              </label>
              <label className="pp-field">
                <span>Race</span>
                <input value={d.race || ''} onChange={e => set('race', e.target.value)} />
              </label>
              <label className="pp-field">
                <span>Class</span>
                <input value={d.class || ''} onChange={e => set('class', e.target.value)} />
              </label>
              <label className="pp-field">
                <span>Subclass</span>
                <input value={d.subclass || ''} onChange={e => set('subclass', e.target.value)} />
              </label>
              <label className="pp-field">
                <span>Level</span>
                <input type="number" value={d.level || ''} onChange={e => set('level', Number(e.target.value))} />
              </label>
              <label className="pp-field">
                <span>HP</span>
                <input type="number" value={d.hp || ''} onChange={e => set('hp', Number(e.target.value))} />
              </label>
              <label className="pp-field">
                <span>AC</span>
                <input type="number" value={d.ac || ''} onChange={e => set('ac', Number(e.target.value))} />
              </label>
              <label className="pp-field">
                <span>Speed</span>
                <input type="number" value={d.speed || ''} onChange={e => set('speed', Number(e.target.value))} />
              </label>
              <label className="pp-field">
                <span>Alignment</span>
                <input value={d.alignment || ''} onChange={e => set('alignment', e.target.value)} />
              </label>
            </div>
          )}

          {isEditMode && draft && (
            <div className="pp-actions">
              {msg && <span className="pp-msg">{msg}</span>}
              <button className="pp-btn pp-btn--save" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save Hero'}
              </button>
              <button className="pp-btn pp-btn--cancel" onClick={() => setDraft(null)}>
                Discard
              </button>
            </div>
          )}

          {/* Attribution */}
          {(hero.createdBy || hero.updatedBy) && (
            <div className="pp-attribution">
              {hero.createdBy && (
                <span className="pp-attribution__item">
                  ✍️ Added by <strong>{hero.createdBy}</strong>
                </span>
              )}
              {hero.updatedBy && hero.updatedBy !== hero.createdBy && (
                <span className="pp-attribution__item">
                  · Edited by <strong>{hero.updatedBy}</strong>
                </span>
              )}
              {hero.updatedAt && (
                <span className="pp-attribution__date">
                  {new Date(hero.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── NpcCard ──────────────────────────────────────────────────────────────────

function NpcCard({ npc, isAdmin, isEditMode, locations, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState('');

  const d = draft || npc;

  const set = (field, val) => setDraft(prev => ({ ...(prev || npc), [field]: val }));

  const linkedLocation = locations.find(l => String(l.id) === String(d.locationId));

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API}/entities/npcs/${npc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: d.name, type: d.type, role: d.role, blurb: d.blurb,
          locationId: d.locationId || null, visible: d.visible,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
      const j = await res.json();
      onUpdate(j.item);
      setMsg('Saved!');
      setDraft(null);
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/entities/npcs/${npc.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      onDelete(npc.id);
    } catch (e) { setMsg(e.message); setDeleting(false); setConfirmDelete(false); }
  };

  return (
    <div className={`pp-card pp-card--npc ${open ? 'pp-card--open' : ''}`}>
      <div className="pp-card__header" role="button" tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(v => !v)}
      >
        <div className="pp-card__title-row">
          <span className="pp-card__accent pp-card__accent--npc" />
          <div>
            <p className="pp-card__eyebrow">{d.type || d.role || 'NPC'}</p>
            <h3 className="pp-card__name">{d.name}</h3>
          </div>
        </div>
        <div className="pp-card__meta-row">
          {linkedLocation && (
            <span className="pp-badge pp-badge--loc">📍 {linkedLocation.name}</span>
          )}
          <span className="pp-card__chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="pp-card__body" onClick={e => e.stopPropagation()}>
          {isEditMode && isAdmin ? (
            <>
              <div className="pp-edit-grid">
                <label className="pp-field">
                  <span>Name</span>
                  <input value={d.name || ''} onChange={e => set('name', e.target.value)} />
                </label>
                <label className="pp-field">
                  <span>Type / Role</span>
                  <input value={d.type || ''} onChange={e => set('type', e.target.value)} />
                </label>
                <label className="pp-field pp-field--full">
                  <span>Description</span>
                  <textarea className="pp-textarea" rows={3}
                    value={d.blurb || ''}
                    onChange={e => set('blurb', e.target.value)} />
                </label>
                <label className="pp-field pp-field--full">
                  <span>Location</span>
                  <select value={d.locationId || ''}
                    onChange={e => set('locationId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— No location —</option>
                    {[...locations].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </label>
                <label className="pp-field pp-field--check">
                  <input type="checkbox" checked={d.visible !== false}
                    onChange={e => set('visible', e.target.checked)} />
                  <span>Visible to players</span>
                </label>
              </div>
              <div className="pp-actions">
                {msg && <span className="pp-msg">{msg}</span>}
                <button className="pp-btn pp-btn--save" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {draft && (
                  <button className="pp-btn pp-btn--cancel" onClick={() => { setDraft(null); setMsg(''); }}>
                    Discard
                  </button>
                )}
                {!confirmDelete ? (
                  <button className="pp-btn pp-btn--delete" onClick={() => setConfirmDelete(true)}>
                    Delete NPC
                  </button>
                ) : (
                  <>
                    <button className="pp-btn pp-btn--delete-confirm" disabled={deleting} onClick={doDelete}>
                      {deleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button className="pp-btn pp-btn--cancel" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {d.blurb && <p className="pp-blurb">"{d.blurb}"</p>}
              {linkedLocation && (
                <div className="pp-section">
                  <p className="pp-section__label">Location</p>
                  <p className="pp-location-link">📍 {linkedLocation.name}
                    {linkedLocation.type && <span className="pp-muted"> · {linkedLocation.type}</span>}
                  </p>
                </div>
              )}
              {d.secretId && isAdmin && (
                <div className="pp-section">
                  <p className="pp-section__label">Secret</p>
                  <span className="pp-badge pp-badge--secret">🔒 {d.secretId}</span>
                </div>
              )}
              {/* Attribution */}
              {(npc.createdBy || npc.updatedBy) && (
                <div className="pp-attribution">
                  {npc.createdBy && (
                    <span className="pp-attribution__item">
                      ✍️ Added by <strong>{npc.createdBy}</strong>
                    </span>
                  )}
                  {npc.updatedBy && npc.updatedBy !== npc.createdBy && (
                    <span className="pp-attribution__item">
                      · Edited by <strong>{npc.updatedBy}</strong>
                    </span>
                  )}
                  {npc.updatedAt && (
                    <span className="pp-attribution__date">
                      {new Date(npc.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, open, onToggle, children }) {
  return (
    <div className={`pp-section-hd ${open ? 'pp-section-hd--open' : ''}`}>
      <div className="pp-section-hd__main" role="button" tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      >
        <div>
          <h2 className="pp-section-hd__title">{title}</h2>
          <p className="pp-section-hd__count">{count} {count === 1 ? 'entry' : 'entries'}</p>
        </div>
        <span className="pp-section-hd__arrow">{open ? '▲' : '▼'}</span>
      </div>
      {children && <div className="pp-section-hd__actions">{children}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PeoplePage() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const canEdit = ['player', 'editor', 'admin'].includes(role);

  const [heroes, setHeroes] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [heroOpen, setHeroOpen] = useState(true);
  const [npcOpen, setNpcOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [hRes, nRes, lRes] = await Promise.all([
        fetch(`${API}/heroes`, { credentials: 'include' }),
        fetch(`${API}/entities/npcs`, { credentials: 'include' }),
        fetch(`${API}/locations`, { credentials: 'include' }),
      ]);
      if (hRes.ok) { const j = await hRes.json(); setHeroes(j.heroes || []); }
      if (nRes.ok) { const j = await nRes.json(); setNpcs(j.items || []); }
      if (lRes.ok) { const j = await lRes.json(); setLocations(j.locations || []); }
    } catch (e) { setError(e.message || 'Unable to load people data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNpcUpdate = (updated) => {
    setNpcs(prev => prev.map(n => String(n.id) === String(updated.id) ? updated : n));
  };

  const handleNpcDelete = (id) => {
    setNpcs(prev => prev.filter(n => String(n.id) !== String(id)));
  };

  const addNpc = async () => {
    if (!isAdmin || !user) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/entities/npcs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: 'New NPC', type: 'Unknown', blurb: '', visible: true }),
      });
      if (!res.ok) throw new Error('Failed to create NPC');
      const j = await res.json();
      if (j.item) setNpcs(prev => [...prev, j.item]);
      setNpcOpen(true);
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const visibleNpcs = isAdmin && editMode ? npcs : npcs.filter(n => n.visible !== false);

  return (
    <div className="pp-page">
      <div className="pp-page__bg" aria-hidden="true" />

      <header className="pp-header">
        <div>
          <p className="pp-eyebrow">Azterra</p>
          <h1 className="pp-title">People of the World</h1>
          <p className="pp-subtitle">The heroes and notable figures shaping the realm.</p>
        </div>
        {canEdit && (
          <button
            className={`pp-edit-toggle ${editMode ? 'pp-edit-toggle--active' : ''}`}
            onClick={() => setEditMode(v => !v)}
          >
            {editMode ? '✏️ Edit Mode On' : '✏️ Edit Mode'}
          </button>
        )}
      </header>

      {error && <p className="pp-error">{error}</p>}
      {loading && <p className="pp-loading">Loading…</p>}

      {/* ── The Party ─────────────────────────────────────── */}
      {!loading && (
        <section className="pp-section-wrap">
          <SectionHeader
            title="The Party"
            count={heroes.length}
            open={heroOpen}
            onToggle={() => setHeroOpen(v => !v)}
          />
          {heroOpen && (
            <div className="pp-cards">
              {heroes.length === 0 && <p className="pp-empty-state">No heroes found.</p>}
              {heroes.map(h => (
                <HeroCard
                  key={h.id}
                  hero={h}
                  isAdmin={isAdmin}
                  isEditMode={editMode}
                  locations={locations}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Notable Figures ───────────────────────────────── */}
      {!loading && (
        <section className="pp-section-wrap">
          <SectionHeader
            title="Notable Figures"
            count={visibleNpcs.length}
            open={npcOpen}
            onToggle={() => setNpcOpen(v => !v)}
          >
            {isAdmin && editMode && (
              <button className="pp-btn pp-btn--add" disabled={adding} onClick={addNpc}>
                {adding ? 'Adding…' : '+ Add NPC'}
              </button>
            )}
          </SectionHeader>
          {npcOpen && (
            <div className="pp-cards">
              {visibleNpcs.length === 0 && <p className="pp-empty-state">No notable figures found.</p>}
              {visibleNpcs.map(n => (
                <NpcCard
                  key={n.id}
                  npc={n}
                  isAdmin={isAdmin}
                  isEditMode={editMode}
                  locations={locations}
                  onUpdate={handleNpcUpdate}
                  onDelete={handleNpcDelete}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default PeoplePage;
