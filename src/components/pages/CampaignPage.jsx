import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import './CampaignPage.css';

const API = '/api';

// ── D&D 5e constants ─────────────────────────────────────────────────────────

const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const STAT_NAMES  = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

const SKILLS = [
  { name: 'Acrobatics',      stat: 'dex' },
  { name: 'Animal Handling', stat: 'wis' },
  { name: 'Arcana',          stat: 'int' },
  { name: 'Athletics',       stat: 'str' },
  { name: 'Deception',       stat: 'cha' },
  { name: 'History',         stat: 'int' },
  { name: 'Insight',         stat: 'wis' },
  { name: 'Intimidation',    stat: 'cha' },
  { name: 'Investigation',   stat: 'int' },
  { name: 'Medicine',        stat: 'wis' },
  { name: 'Nature',          stat: 'int' },
  { name: 'Perception',      stat: 'wis' },
  { name: 'Performance',     stat: 'cha' },
  { name: 'Persuasion',      stat: 'cha' },
  { name: 'Religion',        stat: 'int' },
  { name: 'Sleight of Hand', stat: 'dex' },
  { name: 'Stealth',         stat: 'dex' },
  { name: 'Survival',        stat: 'wis' },
];

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

const SHEET_TABS = ['Overview', 'Combat', 'Skills', 'Gear & Spells', 'Background'];

function mod(val) {
  const m = Math.floor((Number(val || 10) - 10) / 2);
  return m >= 0 ? `+${m}` : String(m);
}

function blankCharacter(campaignId) {
  return {
    id: null,
    campaignId,
    name: '',
    race: '',
    class: '',
    subclass: '',
    level: 1,
    background: '',
    alignment: '',
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: 0,
    maxHp: 0,
    ac: 10,
    speed: 30,
    initiative: null,
    hitDice: '',
    proficiencyBonus: 2,
    savingThrows: {},
    skills: {},
    equipment: [],
    spells: [],
    abilities: [],
    features: [],
    languages: [],
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    notes: '',
    color: '#cfaa68',
  };
}

// ── StatBlock ────────────────────────────────────────────────────────────────

function StatBlock({ stat, value, editing, onChange }) {
  const m = mod(value);
  return (
    <div className="cp-stat">
      <span className="cp-stat__label">{STAT_LABELS[stat]}</span>
      <span className="cp-stat__mod">{m}</span>
      {editing ? (
        <input
          className="cp-stat__input"
          type="number"
          min={1}
          max={30}
          value={value ?? 10}
          onChange={e => onChange(Number(e.target.value))}
        />
      ) : (
        <span className="cp-stat__val">{value ?? 10}</span>
      )}
      <span className="cp-stat__name">{STAT_NAMES[stat]}</span>
    </div>
  );
}

// ── CharacterSheet ────────────────────────────────────────────────────────────

function CharacterSheet({ character, campaignId, onSave, onClose, isDM, readOnly = false }) {
  const [tab, setTab] = useState('Overview');
  const [draft, setDraft] = useState(character || blankCharacter(campaignId));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const isNew = !character?.id;

  const set = (field, val) => setDraft(prev => ({ ...prev, [field]: val }));
  const setStat = (stat, val) => setDraft(prev => ({
    ...prev,
    stats: { ...prev.stats, [stat]: val },
  }));

  const saveSheet = async () => {
    if (!draft.name?.trim()) { setMsg('Character name is required.'); return; }
    setSaving(true);
    setMsg('');
    try {
      let res;
      if (isNew) {
        res = await fetch(`${API}/campaigns/${campaignId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(draft),
        });
      } else {
        res = await fetch(`${API}/campaigns/${campaignId}/characters/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(draft),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      setMsg('Saved!');
      onSave(j.character);
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const editing = !readOnly;
  const color = draft.color || '#cfaa68';

  const textArr = (arr) => (Array.isArray(arr) ? arr.join('\n') : arr || '');
  const parseArr = (str) => str.split('\n').map(s => s.trim()).filter(Boolean);

  return (
    <div className="cp-sheet" style={{ '--char-color': color }}>
      {/* Sheet header */}
      <div className="cp-sheet__header">
        <div className="cp-sheet__title-row">
          <div className="cp-sheet__name-block">
            {editing ? (
              <input
                className="cp-sheet__name-input"
                value={draft.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Character Name"
              />
            ) : (
              <h2 className="cp-sheet__name">{draft.name || 'Unnamed'}</h2>
            )}
            <div className="cp-sheet__tagline">
              {editing ? (
                <div className="cp-sheet__basics-row">
                  <input className="cp-sheet__sm-input" value={draft.race} onChange={e => set('race', e.target.value)} placeholder="Race" />
                  <input className="cp-sheet__sm-input" value={draft.class} onChange={e => set('class', e.target.value)} placeholder="Class" />
                  <input className="cp-sheet__sm-input" value={draft.subclass} onChange={e => set('subclass', e.target.value)} placeholder="Subclass" />
                  <input className="cp-sheet__sm-input cp-sheet__sm-input--num" type="number" min={1} max={20}
                    value={draft.level} onChange={e => set('level', Number(e.target.value))} placeholder="Lvl" />
                </div>
              ) : (
                <span>{[draft.race, draft.class, draft.subclass].filter(Boolean).join(' · ')}{draft.level ? ` · Lvl ${draft.level}` : ''}</span>
              )}
            </div>
          </div>
          <button className="cp-sheet__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Color picker for editors */}
        {editing && (
          <div className="cp-sheet__color-row">
            <span className="cp-sheet__color-label">Accent color</span>
            <input type="color" value={color} onChange={e => set('color', e.target.value)} className="cp-sheet__color-swatch" />
          </div>
        )}

        {/* Tabs */}
        <div className="cp-sheet__tabs">
          {SHEET_TABS.map(t => (
            <button
              key={t}
              className={`cp-sheet__tab ${tab === t ? 'cp-sheet__tab--active' : ''}`}
              onClick={() => setTab(t)}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Sheet body */}
      <div className="cp-sheet__body">

        {/* ── Overview tab ── */}
        {tab === 'Overview' && (
          <div className="cp-sheet__section">
            <div className="cp-stats-grid">
              {STATS.map(s => (
                <StatBlock key={s} stat={s} value={draft.stats?.[s]} editing={editing}
                  onChange={v => setStat(s, v)} />
              ))}
            </div>

            <div className="cp-combat-row">
              {[
                { label: 'HP',   field: 'hp',   type: 'number' },
                { label: 'Max HP', field: 'maxHp', type: 'number' },
                { label: 'AC',   field: 'ac',   type: 'number' },
                { label: 'Speed', field: 'speed', type: 'number' },
                { label: 'Prof. Bonus', field: 'proficiencyBonus', type: 'number' },
              ].map(({ label, field, type }) => (
                <div key={field} className="cp-combat-stat">
                  <span className="cp-combat-stat__label">{label}</span>
                  {editing ? (
                    <input className="cp-combat-stat__input" type={type}
                      value={draft[field] ?? ''} onChange={e => set(field, Number(e.target.value))} />
                  ) : (
                    <span className="cp-combat-stat__val">{draft[field] ?? '—'}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="cp-field-row">
              <label className="cp-field">
                <span>Background</span>
                {editing
                  ? <input value={draft.background} onChange={e => set('background', e.target.value)} placeholder="Outlander, Sage…" />
                  : <span className="cp-field__val">{draft.background || '—'}</span>}
              </label>
              <label className="cp-field">
                <span>Alignment</span>
                {editing
                  ? <select value={draft.alignment} onChange={e => set('alignment', e.target.value)}>
                      <option value="">— Select —</option>
                      {ALIGNMENTS.map(a => <option key={a}>{a}</option>)}
                    </select>
                  : <span className="cp-field__val">{draft.alignment || '—'}</span>}
              </label>
              <label className="cp-field">
                <span>Hit Dice</span>
                {editing
                  ? <input value={draft.hitDice} onChange={e => set('hitDice', e.target.value)} placeholder="e.g. 7d8" />
                  : <span className="cp-field__val">{draft.hitDice || '—'}</span>}
              </label>
            </div>
          </div>
        )}

        {/* ── Combat tab ── */}
        {tab === 'Combat' && (
          <div className="cp-sheet__section">
            <h3 className="cp-section-title">Saving Throws</h3>
            <div className="cp-saves-grid">
              {STATS.map(s => {
                const proficient = draft.savingThrows?.[s];
                const base = Math.floor((Number(draft.stats?.[s] || 10) - 10) / 2);
                const bonus = base + (proficient ? (draft.proficiencyBonus || 2) : 0);
                const sign = bonus >= 0 ? '+' : '';
                return (
                  <div key={s} className="cp-save">
                    {editing && (
                      <input type="checkbox" checked={!!proficient}
                        onChange={e => set('savingThrows', { ...draft.savingThrows, [s]: e.target.checked })} />
                    )}
                    <span className="cp-save__mod">{sign}{bonus}</span>
                    <span className="cp-save__name">{STAT_NAMES[s]}</span>
                  </div>
                );
              })}
            </div>

            <h3 className="cp-section-title">Abilities & Features</h3>
            {editing ? (
              <textarea className="cp-textarea" rows={6}
                value={textArr(draft.abilities)}
                onChange={e => set('abilities', parseArr(e.target.value))}
                placeholder="One ability per line…" />
            ) : (
              <ul className="cp-list">
                {(draft.abilities || []).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}

            <h3 className="cp-section-title">Languages</h3>
            {editing ? (
              <input className="cp-input" value={(draft.languages || []).join(', ')}
                onChange={e => set('languages', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="Common, Elvish, Dwarvish…" />
            ) : (
              <p className="cp-text">{(draft.languages || []).join(', ') || '—'}</p>
            )}
          </div>
        )}

        {/* ── Skills tab ── */}
        {tab === 'Skills' && (
          <div className="cp-sheet__section">
            <div className="cp-skills-list">
              {SKILLS.map(sk => {
                const proficient = draft.skills?.[sk.name];
                const base = Math.floor((Number(draft.stats?.[sk.stat] || 10) - 10) / 2);
                const bonus = base + (proficient ? (draft.proficiencyBonus || 2) : 0);
                const sign = bonus >= 0 ? '+' : '';
                return (
                  <div key={sk.name} className={`cp-skill ${proficient ? 'cp-skill--prof' : ''}`}>
                    {editing && (
                      <input type="checkbox" checked={!!proficient}
                        onChange={e => set('skills', { ...draft.skills, [sk.name]: e.target.checked })} />
                    )}
                    <span className="cp-skill__bonus">{sign}{bonus}</span>
                    <span className="cp-skill__name">{sk.name}</span>
                    <span className="cp-skill__stat">{STAT_LABELS[sk.stat]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Gear & Spells tab ── */}
        {tab === 'Gear & Spells' && (
          <div className="cp-sheet__section">
            <h3 className="cp-section-title">Equipment</h3>
            {editing ? (
              <textarea className="cp-textarea" rows={6}
                value={textArr(draft.equipment)}
                onChange={e => set('equipment', parseArr(e.target.value))}
                placeholder="One item per line…" />
            ) : (
              draft.equipment?.length > 0
                ? <ul className="cp-list cp-list--compact">
                    {draft.equipment.map((eq, i) => <li key={i}>{eq}</li>)}
                  </ul>
                : <p className="cp-empty">No equipment listed.</p>
            )}

            <h3 className="cp-section-title">Spells</h3>
            {editing ? (
              <textarea className="cp-textarea" rows={6}
                value={textArr(draft.spells)}
                onChange={e => set('spells', parseArr(e.target.value))}
                placeholder="One spell per line…" />
            ) : (
              draft.spells?.length > 0
                ? <div className="cp-tag-list">
                    {draft.spells.map((sp, i) => <span key={i} className="cp-tag">{sp}</span>)}
                  </div>
                : <p className="cp-empty">No spells listed.</p>
            )}

            <h3 className="cp-section-title">Notes</h3>
            {editing ? (
              <textarea className="cp-textarea" rows={4}
                value={draft.notes || ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="Miscellaneous notes…" />
            ) : (
              <p className="cp-text">{draft.notes || '—'}</p>
            )}
          </div>
        )}

        {/* ── Background tab ── */}
        {tab === 'Background' && (
          <div className="cp-sheet__section">
            {[
              { label: 'Personality Traits', field: 'personalityTraits', rows: 3 },
              { label: 'Ideals',             field: 'ideals',            rows: 2 },
              { label: 'Bonds',              field: 'bonds',             rows: 2 },
              { label: 'Flaws',              field: 'flaws',             rows: 2 },
              { label: 'Backstory',          field: 'backstory',         rows: 6 },
            ].map(({ label, field, rows }) => (
              <div key={field} className="cp-bg-field">
                <h3 className="cp-section-title">{label}</h3>
                {editing ? (
                  <textarea className="cp-textarea" rows={rows}
                    value={draft[field] || ''}
                    onChange={e => set(field, e.target.value)}
                    placeholder={`${label}…`} />
                ) : (
                  <p className="cp-text">{draft[field] || '—'}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save bar */}
      {editing && (
        <div className="cp-sheet__footer">
          {msg && <span className={`cp-msg ${msg === 'Saved!' ? 'cp-msg--ok' : 'cp-msg--err'}`}>{msg}</span>}
          <button className="cp-btn cp-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="cp-btn cp-btn--primary" onClick={saveSheet} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create Character' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── CharacterCard ─────────────────────────────────────────────────────────────

function CharacterCard({ character, onClick, onDelete, canDelete }) {
  const color = character.color || '#cfaa68';
  const topStats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  return (
    <div className="cp-char-card" style={{ '--char-color': color }} onClick={onClick}
      role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="cp-char-card__stripe" />
      <div className="cp-char-card__body">
        <div className="cp-char-card__top">
          <div>
            <p className="cp-char-card__class">
              {[character.class, character.subclass].filter(Boolean).join(' · ') || 'Adventurer'}
              {character.level ? ` · Lv ${character.level}` : ''}
            </p>
            <h3 className="cp-char-card__name">{character.name || 'Unnamed'}</h3>
            <p className="cp-char-card__race">{character.race || ''}</p>
          </div>
          <div className="cp-char-card__vitals">
            {character.hp != null && (
              <div className="cp-vital">
                <span className="cp-vital__label">HP</span>
                <span className="cp-vital__val">{character.hp}{character.maxHp ? `/${character.maxHp}` : ''}</span>
              </div>
            )}
            {character.ac != null && (
              <div className="cp-vital">
                <span className="cp-vital__label">AC</span>
                <span className="cp-vital__val">{character.ac}</span>
              </div>
            )}
          </div>
        </div>

        {character.stats && (
          <div className="cp-char-card__stats">
            {topStats.map(s => (
              <div key={s} className="cp-char-card__stat">
                <span className="cp-char-card__stat-mod">{mod(character.stats[s])}</span>
                <span className="cp-char-card__stat-key">{STAT_LABELS[s]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {canDelete && (
        <button className="cp-char-card__del" onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Remove character">✕</button>
      )}
    </div>
  );
}

// ── SessionNotes ──────────────────────────────────────────────────────────────

function SessionNotes({ notes = [], onSave }) {
  const [draft, setDraft] = useState(notes.join('\n\n'));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleChange = (val) => { setDraft(val); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await onSave(draft.split('\n\n').map(s => s.trim()).filter(Boolean));
    setSaving(false);
    setDirty(false);
  };

  return (
    <div className="cp-notes">
      <div className="cp-notes__header">
        <h3 className="cp-notes__title">⚔️ Session Notes</h3>
        {dirty && (
          <button className="cp-btn cp-btn--sm cp-btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        )}
      </div>
      <textarea
        className="cp-notes__area"
        rows={8}
        value={draft}
        onChange={e => handleChange(e.target.value)}
        placeholder="Track events, plot threads, loot, and important moments from your sessions…"
      />
    </div>
  );
}

// ── CreateCampaignModal ───────────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    if (!name.trim()) { setErr('Campaign name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`${API}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to create campaign');
      onCreate(j.campaign);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()}>
        <h2 className="cp-modal__title">New Campaign</h2>
        <label className="cp-modal__field">
          <span>Name</span>
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
            placeholder="The Dormfall Arc…"
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </label>
        <label className="cp-modal__field">
          <span>Description <em>(optional)</em></span>
          <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="A short summary of the campaign…" />
        </label>
        {err && <p className="cp-modal__err">{err}</p>}
        <div className="cp-modal__actions">
          <button className="cp-btn cp-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="cp-btn cp-btn--primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignPage() {
  const { user, role } = useAuth();
  const isDM     = role === 'admin';
  const canEdit  = ['player', 'editor', 'admin'].includes(role);
  const isGuest  = !canEdit && role !== 'pending';

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null); // { character, campaignId } or { new: true, campaignId }
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState(null);

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId) || null;

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/campaigns/me`, { credentials: 'include' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load campaigns');
      setCampaigns(j.campaigns || []);
      if (j.campaigns?.length > 0 && !activeCampaignId) {
        setActiveCampaignId(j.campaigns[0].id);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Create campaign
  const handleCampaignCreated = (campaign) => {
    setCampaigns(prev => [...prev, campaign]);
    setActiveCampaignId(campaign.id);
    setShowCreateCampaign(false);
  };

  // Delete campaign
  const handleDeleteCampaign = async (id) => {
    setDeletingCampaignId(id);
    try {
      const res = await fetch(`${API}/campaigns/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Delete failed'); }
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (activeCampaignId === id) setActiveCampaignId(campaigns.find(c => c.id !== id)?.id || null);
    } catch (e) { setError(e.message); }
    finally { setDeletingCampaignId(null); }
  };

  // Save character (add or update) — campaignId comes from activeSheet since server doesn't embed it
  const handleCharacterSaved = (character) => {
    const cid = activeSheet?.campaignId;
    setCampaigns(prev => prev.map(c => {
      if (c.id !== cid) return c;
      const existing = c.characters.find(ch => ch.id === character.id);
      return {
        ...c,
        characters: existing
          ? c.characters.map(ch => ch.id === character.id ? character : ch)
          : [...c.characters, character],
      };
    }));
    setActiveSheet(null);
  };

  // Delete character
  const handleDeleteCharacter = async (campaignId, charId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/characters/${charId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      setCampaigns(prev => prev.map(c =>
        c.id === campaignId
          ? { ...c, characters: c.characters.filter(ch => ch.id !== charId) }
          : c
      ));
    } catch (e) { setError(e.message); }
  };

  // Save session notes
  const handleNotesSave = async (noteLines) => {
    if (!activeCampaign) return;
    try {
      const res = await fetch(`${API}/campaigns/${activeCampaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionNotes: noteLines }),
      });
      const j = await res.json();
      if (res.ok) {
        setCampaigns(prev => prev.map(c => c.id === activeCampaign.id ? j.campaign : c));
      }
    } catch (e) { setError(e.message); }
  };

  // ── Guest view ──────────────────────────────────────────────────────────────
  if (isGuest || !user) {
    return (
      <div className="cp-page cp-page--guest">
        <div className="cp-guest-hero">
          <div className="cp-guest-emblem">⚔️</div>
          <h1 className="cp-guest-title">Campaigns</h1>
          <p className="cp-guest-sub">Track your party, characters, and adventures in Azterra.</p>
          <p className="cp-guest-cta">Sign in to create campaigns and manage your character sheets.</p>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading campaigns…</p>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="cp-page">
      {/* Character sheet overlay */}
      {activeSheet && (
        <div className="cp-sheet-overlay">
          <CharacterSheet
            character={activeSheet.new ? null : activeSheet.character}
            campaignId={activeSheet.campaignId}
            onSave={handleCharacterSaved}
            onClose={() => setActiveSheet(null)}
            isDM={isDM}
            readOnly={false}
          />
        </div>
      )}

      {/* Create campaign modal */}
      {showCreateCampaign && (
        <CreateCampaignModal
          onClose={() => setShowCreateCampaign(false)}
          onCreate={handleCampaignCreated}
        />
      )}

      {/* Page header */}
      <header className="cp-header">
        <div className="cp-header__left">
          <p className="cp-header__eyebrow">Azterra</p>
          <h1 className="cp-header__title">
            {isDM ? '⚔️ Campaign Master' : '🗡️ My Campaigns'}
          </h1>
        </div>
        {canEdit && (
          <button className="cp-btn cp-btn--primary cp-btn--new-campaign"
            onClick={() => setShowCreateCampaign(true)}>
            + New Campaign
          </button>
        )}
      </header>

      {error && <div className="cp-error">{error} <button onClick={() => setError('')}>×</button></div>}

      <div className="cp-layout">
        {/* ── Sidebar: Campaign list ── */}
        <aside className="cp-sidebar">
          <h2 className="cp-sidebar__title">Campaigns</h2>
          {campaigns.length === 0 ? (
            <div className="cp-sidebar__empty">
              <p>No campaigns yet.</p>
              {canEdit && (
                <button className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setShowCreateCampaign(true)}>
                  Create your first
                </button>
              )}
            </div>
          ) : (
            <ul className="cp-campaign-list">
              {[...campaigns].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).map(c => (
                <li
                  key={c.id}
                  className={`cp-campaign-item ${activeCampaignId === c.id ? 'cp-campaign-item--active' : ''}`}
                  onClick={() => setActiveCampaignId(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setActiveCampaignId(c.id)}
                >
                  <div className="cp-campaign-item__body">
                    <span className="cp-campaign-item__name">{c.name}</span>
                    <span className="cp-campaign-item__meta">
                      {c.characters?.length || 0} character{c.characters?.length !== 1 ? 's' : ''}
                    </span>
                    {c.description && <span className="cp-campaign-item__desc">{c.description}</span>}
                  </div>
                  {canEdit && deletingCampaignId !== c.id && (
                    <button
                      className="cp-campaign-item__del"
                      onClick={e => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
                      title="Delete campaign"
                    >✕</button>
                  )}
                  {deletingCampaignId === c.id && <span className="cp-campaign-item__deleting">…</span>}
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Main: Campaign detail ── */}
        <main className="cp-main">
          {!activeCampaign ? (
            <div className="cp-main__empty">
              <p className="cp-main__empty-icon">🗺️</p>
              <p>Select a campaign to view its party and details.</p>
              {canEdit && (
                <button className="cp-btn cp-btn--primary cp-btn--sm" onClick={() => setShowCreateCampaign(true)}>
                  + New Campaign
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Campaign title bar */}
              <div className="cp-campaign-header">
                <div>
                  <h2 className="cp-campaign-header__name">{activeCampaign.name}</h2>
                  {activeCampaign.description && (
                    <p className="cp-campaign-header__desc">{activeCampaign.description}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    className="cp-btn cp-btn--gold"
                    onClick={() => setActiveSheet({ new: true, campaignId: activeCampaign.id })}
                  >
                    + Add Character
                  </button>
                )}
              </div>

              {/* Party roster */}
              <section className="cp-party">
                <h3 className="cp-party__title">
                  Party Roster
                  <span className="cp-party__count">{activeCampaign.characters?.length || 0}</span>
                </h3>

                {(!activeCampaign.characters || activeCampaign.characters.length === 0) ? (
                  <div className="cp-party__empty">
                    <p>No characters in this campaign yet.</p>
                    {canEdit && (
                      <button className="cp-btn cp-btn--ghost cp-btn--sm"
                        onClick={() => setActiveSheet({ new: true, campaignId: activeCampaign.id })}>
                        Add the first character
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="cp-party__grid">
                    {activeCampaign.characters.map(ch => (
                      <CharacterCard
                        key={ch.id}
                        character={ch}
                        onClick={() => setActiveSheet({ character: ch, campaignId: activeCampaign.id })}
                        canDelete={canEdit}
                        onDelete={() => handleDeleteCharacter(activeCampaign.id, ch.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Session notes — visible to all, but DM gets an editable version */}
              {isDM ? (
                <SessionNotes
                  notes={activeCampaign.sessionNotes || []}
                  onSave={handleNotesSave}
                />
              ) : (activeCampaign.sessionNotes?.length > 0) && (
                <section className="cp-notes cp-notes--readonly">
                  <h3 className="cp-notes__title">⚔️ Session Notes</h3>
                  <div className="cp-notes__read">
                    {activeCampaign.sessionNotes.map((note, i) => (
                      <p key={i} className="cp-notes__entry">{note}</p>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
