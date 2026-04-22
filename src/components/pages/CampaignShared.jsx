import React, { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';

export const CAMPAIGN_API = '/api';
const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];
const SHEET_TABS = ['Overview', 'Combat', 'Skills', 'Gear & Spells', 'Background'];

export async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

export function blankCharacter() {
  return {
    id: null,
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

export function mod(val) {
  const next = Math.floor((Number(val || 10) - 10) / 2);
  return next >= 0 ? `+${next}` : String(next);
}

export function calculatePassivePerception(character) {
  const wis = Number(character?.stats?.wis || 10);
  const wisMod = Math.floor((wis - 10) / 2);
  const perception = character?.skills?.perception;
  const perceptionBonus =
    typeof perception === 'number'
      ? perception
      : perception && typeof perception === 'object' && Number.isFinite(Number(perception.bonus))
        ? Number(perception.bonus)
        : perception === true
          ? Number(character?.proficiencyBonus || 2)
          : 0;
  return 10 + wisMod + perceptionBonus;
}

function StatBlock({ stat, value, editing, onChange }) {
  return (
    <div className="cp-stat">
      <span className="cp-stat__label">{STAT_LABELS[stat]}</span>
      <span className="cp-stat__mod">{mod(value)}</span>
      {editing ? (
        <input
          className="cp-stat__input"
          type="number"
          min={1}
          max={30}
          value={value ?? 10}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      ) : (
        <span className="cp-stat__val">{value ?? 10}</span>
      )}
    </div>
  );
}

export function CharacterSheetModal({ character, campaignId, canEdit, onClose, onSaved }) {
  const { toast } = useToast();
  const [tab, setTab] = useState('Overview');
  const [draft, setDraft] = useState(character || blankCharacter());
  const [saving, setSaving] = useState(false);
  const isNew = !character?.id;

  useEffect(() => {
    setDraft(character || blankCharacter());
  }, [character]);

  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const setStat = (stat, value) => setDraft((prev) => ({
    ...prev,
    stats: { ...prev.stats, [stat]: value },
  }));
  const textArr = (arr) => (Array.isArray(arr) ? arr.join('\n') : arr || '');
  const parseArr = (value) => value.split('\n').map((entry) => entry.trim()).filter(Boolean);

  const saveSheet = async () => {
    if (!draft.name?.trim()) {
      toast.error('Character name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        campaignId,
      };
      const data = isNew
        ? await apiJson(`${CAMPAIGN_API}/player-characters`, {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : await apiJson(`${CAMPAIGN_API}/player-characters/${draft.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
      toast.success(isNew ? 'Character created.' : 'Character saved.');
      onSaved(data.character);
    } catch (error) {
      toast.error(error.message || 'Unable to save character.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-sheet" onClick={(event) => event.stopPropagation()} style={{ '--char-color': draft.color || '#cfaa68' }}>
        <div className="cp-sheet__header">
          <div className="cp-sheet__title-row">
            <div className="cp-sheet__name-block">
              {canEdit ? (
                <input
                  className="cp-sheet__name-input"
                  value={draft.name}
                  onChange={(event) => setField('name', event.target.value)}
                  placeholder="Character Name"
                />
              ) : (
                <h2 className="cp-sheet__name">{draft.name || 'Unnamed Character'}</h2>
              )}
              <div className="cp-sheet__tagline">
                {canEdit ? (
                  <div className="cp-sheet__basics-row">
                    <input className="cp-sheet__sm-input" value={draft.race} onChange={(event) => setField('race', event.target.value)} placeholder="Race" />
                    <input className="cp-sheet__sm-input" value={draft.class} onChange={(event) => setField('class', event.target.value)} placeholder="Class" />
                    <input className="cp-sheet__sm-input" value={draft.subclass} onChange={(event) => setField('subclass', event.target.value)} placeholder="Subclass" />
                    <input className="cp-sheet__sm-input cp-sheet__sm-input--num" type="number" min={1} max={20} value={draft.level} onChange={(event) => setField('level', Number(event.target.value))} />
                  </div>
                ) : (
                  <span>{[draft.race, draft.class, draft.subclass].filter(Boolean).join(' · ')}{draft.level ? ` · Lvl ${draft.level}` : ''}</span>
                )}
              </div>
            </div>
            <button type="button" className="cp-sheet__close" onClick={onClose}>×</button>
          </div>

          {canEdit && (
            <div className="cp-sheet__color-row">
              <span className="cp-sheet__color-label">Accent color</span>
              <input type="color" value={draft.color || '#cfaa68'} onChange={(event) => setField('color', event.target.value)} className="cp-sheet__color-swatch" />
            </div>
          )}

          <div className="cp-sheet__tabs">
            {SHEET_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`cp-sheet__tab ${tab === entry ? 'cp-sheet__tab--active' : ''}`}
                onClick={() => setTab(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        <div className="cp-sheet__body">
          {tab === 'Overview' && (
            <div className="cp-sheet__section">
              <div className="cp-stats-grid">
                {STATS.map((stat) => (
                  <StatBlock key={stat} stat={stat} value={draft.stats?.[stat]} editing={canEdit} onChange={(value) => setStat(stat, value)} />
                ))}
              </div>
              <div className="cp-combat-row">
                {[
                  ['hp', 'HP'],
                  ['maxHp', 'Max HP'],
                  ['ac', 'AC'],
                  ['speed', 'Speed'],
                  ['proficiencyBonus', 'Prof. Bonus'],
                ].map(([field, label]) => (
                  <div key={field} className="cp-combat-stat">
                    <span className="cp-combat-stat__label">{label}</span>
                    {canEdit ? (
                      <input className="cp-combat-stat__input" type="number" value={draft[field] ?? 0} onChange={(event) => setField(field, Number(event.target.value))} />
                    ) : (
                      <span className="cp-combat-stat__val">{draft[field] ?? '—'}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="cp-field-row">
                <label className="cp-field">
                  <span>Background</span>
                  {canEdit ? <input value={draft.background} onChange={(event) => setField('background', event.target.value)} /> : <span className="cp-field__val">{draft.background || '—'}</span>}
                </label>
                <label className="cp-field">
                  <span>Alignment</span>
                  {canEdit ? (
                    <select value={draft.alignment} onChange={(event) => setField('alignment', event.target.value)}>
                      <option value="">— Select —</option>
                      {ALIGNMENTS.map((entry) => <option key={entry}>{entry}</option>)}
                    </select>
                  ) : (
                    <span className="cp-field__val">{draft.alignment || '—'}</span>
                  )}
                </label>
                <label className="cp-field">
                  <span>Hit Dice</span>
                  {canEdit ? <input value={draft.hitDice} onChange={(event) => setField('hitDice', event.target.value)} /> : <span className="cp-field__val">{draft.hitDice || '—'}</span>}
                </label>
              </div>
            </div>
          )}

          {tab === 'Combat' && (
            <div className="cp-sheet__section">
              <h3 className="cp-section-title">Abilities & Features</h3>
              {canEdit ? (
                <textarea className="cp-textarea" rows={6} value={textArr(draft.abilities)} onChange={(event) => setField('abilities', parseArr(event.target.value))} />
              ) : (
                <ul className="cp-list">{(draft.abilities || []).map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>
              )}
              <h3 className="cp-section-title">Languages</h3>
              {canEdit ? (
                <input className="cp-input" value={(draft.languages || []).join(', ')} onChange={(event) => setField('languages', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))} />
              ) : (
                <p className="cp-text">{(draft.languages || []).join(', ') || '—'}</p>
              )}
            </div>
          )}

          {tab === 'Skills' && (
            <div className="cp-sheet__section">
              <h3 className="cp-section-title">Skill Proficiencies</h3>
              {canEdit ? (
                <textarea className="cp-textarea" rows={6} value={JSON.stringify(draft.skills || {}, null, 2)} onChange={(event) => {
                  try {
                    setField('skills', JSON.parse(event.target.value || '{}'));
                  } catch {
                    // ignore malformed JSON while editing
                  }
                }} />
              ) : (
                <pre className="cp-json-view">{JSON.stringify(draft.skills || {}, null, 2)}</pre>
              )}
            </div>
          )}

          {tab === 'Gear & Spells' && (
            <div className="cp-sheet__section">
              <h3 className="cp-section-title">Equipment</h3>
              {canEdit ? (
                <textarea className="cp-textarea" rows={5} value={textArr(draft.equipment)} onChange={(event) => setField('equipment', parseArr(event.target.value))} />
              ) : (
                <ul className="cp-list cp-list--compact">{(draft.equipment || []).map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>
              )}
              <h3 className="cp-section-title">Spells</h3>
              {canEdit ? (
                <textarea className="cp-textarea" rows={5} value={textArr(draft.spells)} onChange={(event) => setField('spells', parseArr(event.target.value))} />
              ) : (
                <div className="cp-tag-list">{(draft.spells || []).map((entry, index) => <span key={`${entry}-${index}`} className="cp-tag">{entry}</span>)}</div>
              )}
              <h3 className="cp-section-title">Notes</h3>
              {canEdit ? (
                <textarea className="cp-textarea" rows={4} value={draft.notes || ''} onChange={(event) => setField('notes', event.target.value)} />
              ) : (
                <p className="cp-text">{draft.notes || '—'}</p>
              )}
            </div>
          )}

          {tab === 'Background' && (
            <div className="cp-sheet__section">
              {[
                ['personalityTraits', 'Personality Traits'],
                ['ideals', 'Ideals'],
                ['bonds', 'Bonds'],
                ['flaws', 'Flaws'],
                ['backstory', 'Backstory'],
              ].map(([field, label]) => (
                <div key={field} className="cp-bg-field">
                  <h3 className="cp-section-title">{label}</h3>
                  {canEdit ? (
                    <textarea className="cp-textarea" rows={field === 'backstory' ? 6 : 3} value={draft[field] || ''} onChange={(event) => setField(field, event.target.value)} />
                  ) : (
                    <p className="cp-text">{draft[field] || '—'}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cp-sheet__footer">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose}>Close</button>
          {canEdit && (
            <button type="button" className="cp-btn cp-btn--primary" onClick={saveSheet} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Character' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CampaignSettingsModal({ mode = 'create', campaign = null, canDelete = false, onClose, onSaved, onDeleted }) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [visibility, setVisibility] = useState(campaign?.visibility || 'request');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCreate = mode === 'create';

  useEffect(() => {
    setName(campaign?.name || '');
    setDescription(campaign?.description || '');
    setVisibility(campaign?.visibility || 'request');
  }, [campaign]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Campaign name is required.');
      return;
    }
    setSaving(true);
    try {
      const data = await apiJson(isCreate ? `${CAMPAIGN_API}/campaigns` : `${CAMPAIGN_API}/campaigns/${campaign.id}`, {
        method: isCreate ? 'POST' : 'PATCH',
        body: JSON.stringify({ name, description, visibility }),
      });
      toast.success(isCreate ? 'Campaign created.' : 'Campaign updated.');
      onSaved(data.campaign);
    } catch (error) {
      toast.error(error.message || `Unable to ${isCreate ? 'create' : 'update'} campaign.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!campaign?.id) return;
    const confirmed = window.confirm(`Delete "${campaign.name}"? This will remove the campaign workspace for everyone.`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiJson(`${CAMPAIGN_API}/campaigns/${campaign.id}`, { method: 'DELETE' });
      toast.success('Campaign deleted.');
      onDeleted?.(campaign.id);
    } catch (error) {
      toast.error(error.message || 'Unable to delete campaign.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="cp-modal__title">{isCreate ? 'New Campaign' : 'Edit Campaign'}</h2>
        <p className="cp-modal__copy">
          {isCreate
            ? 'Set up the campaign shell first. You can fill in party members, tabletop layout, and session prep after it is created.'
            : 'Update the campaign details and who can request access from the campaign browser.'}
        </p>
        <label className="cp-modal__field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="The Dormfall Arc…" />
        </label>
        <label className="cp-modal__field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this campaign about?" />
        </label>
        <label className="cp-modal__field">
          <span>Join Access</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="request">Request to Join</option>
            <option value="private">Private</option>
          </select>
        </label>
        <div className="cp-modal__actions">
          {!isCreate && canDelete && (
            <button type="button" className="cp-btn cp-btn--danger" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? 'Deleting…' : 'Delete Campaign'}
            </button>
          )}
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="cp-btn cp-btn--primary" onClick={submit} disabled={saving}>
            {saving ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create Campaign' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
