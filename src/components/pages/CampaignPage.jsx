import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './CampaignPage.css';

const API = '/api';
const CAMPAIGN_TABS = ['Overview', 'Party', 'Characters', 'Inventory', 'Session', 'DM Board'];
const BOARD_COLUMNS = [
  { id: 'hidden', label: 'Hidden Box' },
  { id: 'active', label: 'Main Plot' },
  { id: 'revealed', label: 'Revealed' },
];
const STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];
const SHEET_TABS = ['Overview', 'Combat', 'Skills', 'Gear & Spells', 'Background'];

function mod(val) {
  const next = Math.floor((Number(val || 10) - 10) / 2);
  return next >= 0 ? `+${next}` : String(next);
}

function blankCharacter() {
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

async function apiJson(url, options = {}) {
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

function CharacterSheetModal({ character, campaignId, canEdit, onClose, onSaved }) {
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
        ? await apiJson(`${API}/player-characters`, {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : await apiJson(`${API}/player-characters/${draft.id}`, {
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

function CampaignSettingsModal({ mode = 'create', campaign = null, canDelete = false, onClose, onSaved, onDeleted }) {
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
      const data = await apiJson(isCreate ? `${API}/campaigns` : `${API}/campaigns/${campaign.id}`, {
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
      await apiJson(`${API}/campaigns/${campaign.id}`, { method: 'DELETE' });
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
            ? 'Set up the campaign shell first. You can fill in party members, session prep, and inventory after it is created.'
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

function MemberList({ campaign, onMembershipChange, onMembershipRemove }) {
  const { toast } = useToast();
  const members = campaign?.members || [];
  const pendingMembers = campaign?.pendingMembers || [];

  const updateMember = async (userId, patch) => {
    try {
      await onMembershipChange(userId, patch);
      toast.success('Membership updated.');
    } catch (error) {
      toast.error(error.message || 'Unable to update member.');
    }
  };

  return (
    <div className="cp-overview-grid">
      <section className="cp-card">
        <div className="cp-card__header">
          <h3>Party Members</h3>
          <span>{members.length}</span>
        </div>
        <div className="cp-member-list">
          <div className="cp-member cp-member--owner">
            <div>
              <strong>{campaign.ownerName}</strong>
              <span>Campaign Owner DM</span>
            </div>
          </div>
          {members.map((member) => (
            <div key={member.userId} className="cp-member">
              <div>
                <strong>{member.name}</strong>
                <span>{member.isCoDm ? 'Co-DM' : 'Player'}</span>
              </div>
              {campaign.canManage && (
                <div className="cp-member__actions">
                  <button type="button" className="cp-chip-btn" onClick={() => updateMember(member.userId, { role: member.isCoDm ? 'player' : 'co_dm', status: 'approved' })}>
                    {member.isCoDm ? 'Demote' : 'Promote'}
                  </button>
                  <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onMembershipRemove(member.userId)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="cp-card">
        <div className="cp-card__header">
          <h3>Pending Requests</h3>
          <span>{pendingMembers.length}</span>
        </div>
        {pendingMembers.length === 0 ? (
          <p className="cp-empty">No pending join requests.</p>
        ) : (
          <div className="cp-member-list">
            {pendingMembers.map((member) => (
              <div key={member.userId} className="cp-member">
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email || member.username || 'Pending player'}</span>
                </div>
                <div className="cp-member__actions">
                  <button type="button" className="cp-chip-btn" onClick={() => updateMember(member.userId, { status: 'approved', role: member.role || 'player' })}>
                    Approve
                  </button>
                  <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => updateMember(member.userId, { status: 'rejected', role: 'player' })}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AttachmentEditor({ character, onSave }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(character.attachment || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(character.attachment || {});
  }, [character]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(character.id, draft);
      toast.success('Character campaign state saved.');
    } catch (error) {
      toast.error(error.message || 'Unable to update character state.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cp-attachment-editor">
      <label>
        <span>Nickname</span>
        <input value={draft.nickname || ''} onChange={(event) => setDraft((prev) => ({ ...prev, nickname: event.target.value }))} />
      </label>
      <label>
        <span>Status</span>
        <input value={draft.status || 'active'} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))} />
      </label>
      <div className="cp-inline-fields">
        <label>
          <span>Current HP</span>
          <input type="number" value={draft.currentHp ?? ''} onChange={(event) => setDraft((prev) => ({ ...prev, currentHp: event.target.value === '' ? null : Number(event.target.value) }))} />
        </label>
        <label>
          <span>Max HP</span>
          <input type="number" value={draft.maxHp ?? ''} onChange={(event) => setDraft((prev) => ({ ...prev, maxHp: event.target.value === '' ? null : Number(event.target.value) }))} />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea rows={3} value={draft.notes || ''} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} />
      </label>
      <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Party State'}
      </button>
    </div>
  );
}

function PartyPanel({ campaign, onOpenSheet, onSaveAttachment, onDetachCharacter }) {
  return (
    <div className="cp-party-grid">
      {campaign.attachedCharacters.length === 0 ? (
        <div className="cp-empty cp-empty--wide">No attached characters yet.</div>
      ) : (
        campaign.attachedCharacters.map((character) => (
          <section key={character.id} className="cp-party-card">
            <div className="cp-party-card__head" style={{ '--char-color': character.color || '#cfaa68' }}>
              <div>
                <p>{character.ownerName}</p>
                <h3>{character.attachment?.nickname || character.name}</h3>
                <span>{[character.race, character.class].filter(Boolean).join(' · ')} · Lv {character.level}</span>
              </div>
              <div className="cp-party-card__meta">
                <span>HP {character.attachment?.currentHp ?? character.hp}/{character.attachment?.maxHp ?? character.maxHp}</span>
                <span>{character.attachment?.status || 'active'}</span>
              </div>
            </div>
            <div className="cp-party-card__actions">
              <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(character, character.canEditSheet)}>
                {character.canEditSheet ? 'Open Sheet' : 'View Sheet'}
              </button>
              {character.canEditAttachment && (
                <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onDetachCharacter(character.id)}>
                  Detach
                </button>
              )}
            </div>
            <div className="cp-party-card__inventory">
              <h4>Inventory</h4>
              {character.inventoryItems.length === 0 ? (
                <p className="cp-empty">No items assigned.</p>
              ) : (
                <ul className="cp-mini-list">
                  {character.inventoryItems.map((item) => (
                    <li key={item.id}>{item.name} ×{item.quantity}</li>
                  ))}
                </ul>
              )}
            </div>
            {character.canEditAttachment && <AttachmentEditor character={character} onSave={onSaveAttachment} />}
          </section>
        ))
      )}
    </div>
  );
}

function CharactersPanel({
  campaign,
  playerCharacters,
  onOpenSheet,
  onAttachCharacter,
}) {
  const attachedIds = new Set(campaign.attachedCharacters.map((entry) => String(entry.id)));
  return (
    <div className="cp-character-grid">
      <section className="cp-card">
        <div className="cp-card__header">
          <h3>My Character Library</h3>
          <span>{playerCharacters.length}</span>
        </div>
        {playerCharacters.length === 0 ? (
          <p className="cp-empty">Create a reusable character to attach it here.</p>
        ) : (
          <div className="cp-library-list">
            {playerCharacters.map((character) => (
              <div key={character.id} className="cp-library-card" style={{ '--char-color': character.color || '#cfaa68' }}>
                <div>
                  <strong>{character.name || 'Unnamed Character'}</strong>
                  <span>{[character.race, character.class].filter(Boolean).join(' · ')} · Lv {character.level}</span>
                </div>
                <div className="cp-library-card__actions">
                  <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(character, true)}>
                    Edit
                  </button>
                  <button type="button" className="cp-chip-btn" onClick={() => onAttachCharacter(character.id)} disabled={attachedIds.has(String(character.id))}>
                    {attachedIds.has(String(character.id)) ? 'Attached' : 'Attach'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cp-card">
        <div className="cp-card__header">
          <h3>Attached to Campaign</h3>
          <span>{campaign.attachedCharacters.length}</span>
        </div>
        {campaign.attachedCharacters.length === 0 ? (
          <p className="cp-empty">No characters attached yet.</p>
        ) : (
          <div className="cp-library-list">
            {campaign.attachedCharacters.map((character) => (
              <div key={character.id} className="cp-library-card" style={{ '--char-color': character.color || '#cfaa68' }}>
                <div>
                  <strong>{character.attachment?.nickname || character.name}</strong>
                  <span>{character.ownerName} · {character.attachment?.status || 'active'}</span>
                </div>
                <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(character, character.canEditSheet)}>
                  {character.canEditSheet ? 'Open Sheet' : 'View'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemComposer({ onCreateItem, disabled }) {
  const [draft, setDraft] = useState({ name: '', type: 'gear', quantity: 1, notes: '', tags: '' });
  const submit = async () => {
    if (!draft.name.trim()) return;
    await onCreateItem({
      name: draft.name,
      type: draft.type,
      quantity: Number(draft.quantity) || 1,
      notes: draft.notes,
      tags: draft.tags.split(',').map((entry) => entry.trim()).filter(Boolean),
    });
    setDraft({ name: '', type: 'gear', quantity: 1, notes: '', tags: '' });
  };

  return (
    <div className="cp-item-composer">
      <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Item name" />
      <div className="cp-inline-fields">
        <input value={draft.type} onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))} placeholder="Type" />
        <input type="number" min={1} value={draft.quantity} onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))} placeholder="Qty" />
      </div>
      <input value={draft.tags} onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder="tags, comma, separated" />
      <textarea rows={2} value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" />
      <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={submit} disabled={disabled}>
        Add Item
      </button>
    </div>
  );
}

function InventoryPanel({ campaign, onCreateItem, onMoveItem, onDeleteItem }) {
  const items = campaign.inventory?.items || [];
  const stashItems = items.filter((item) => item.ownerType === 'stash');
  const onDragStart = (event, item) => {
    event.dataTransfer.setData('text/plain', JSON.stringify({ itemId: item.id }));
  };

  const handleDrop = async (event, ownerType, ownerId = null) => {
    event.preventDefault();
    const payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}');
    if (!payload.itemId) return;
    await onMoveItem(payload.itemId, ownerType, ownerId);
  };

  return (
    <div className="cp-inventory-grid">
      <section className="cp-card cp-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'stash')}>
        <div className="cp-card__header">
          <h3>Party Stash</h3>
          <span>{stashItems.length}</span>
        </div>
        {campaign.canManage && <ItemComposer onCreateItem={onCreateItem} />}
        <div className="cp-item-list">
          {stashItems.length === 0 ? (
            <p className="cp-empty">No stash items yet.</p>
          ) : (
            stashItems.map((item) => (
              <div key={item.id} className="cp-item-card" draggable={item.canManage} onDragStart={(event) => onDragStart(event, item)}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.type} · qty {item.quantity}</span>
                  {item.notes && <p>{item.notes}</p>}
                </div>
                {campaign.canManage && (
                  <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onDeleteItem(item.id)}>
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {campaign.attachedCharacters.map((character) => {
        const ownedItems = items.filter((item) => item.ownerType === 'character' && String(item.ownerId) === String(character.id));
        return (
          <section
            key={character.id}
            className="cp-card cp-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, 'character', character.id)}
          >
            <div className="cp-card__header">
              <h3>{character.attachment?.nickname || character.name}</h3>
              <span>{ownedItems.length}</span>
            </div>
            <p className="cp-card__sub">{character.ownerName}</p>
            <div className="cp-item-list">
              {ownedItems.length === 0 ? (
                <p className="cp-empty">Drop items here.</p>
              ) : (
                ownedItems.map((item) => (
                  <div key={item.id} className="cp-item-card" draggable={item.canManage} onDragStart={(event) => onDragStart(event, item)}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.type} · qty {item.quantity}</span>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SessionPanel({ campaign, draft, onChange, onSave }) {
  return (
    <section className="cp-card cp-card--session">
      <div className="cp-card__header">
        <h3>Current Session</h3>
        <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={onSave}>
          Save Session
        </button>
      </div>
      <div className="cp-session-grid">
        <label>
          <span>Session Title</span>
          <input value={draft.title || ''} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>Current Location</span>
          <select value={draft.currentLocationId || ''} onChange={(event) => onChange({ ...draft, currentLocationId: event.target.value || null })}>
            <option value="">None</option>
            {(campaign.locationOptions || []).map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>Summary</span>
        <textarea rows={4} value={draft.summary || ''} onChange={(event) => onChange({ ...draft, summary: event.target.value })} />
      </label>
      <div className="cp-session-grid">
        <label>
          <span>Objectives</span>
          <textarea rows={5} value={(draft.objectives || []).join('\n')} onChange={(event) => onChange({ ...draft, objectives: event.target.value.split('\n').map((entry) => entry.trim()).filter(Boolean) })} />
        </label>
        <label>
          <span>Recent Loot</span>
          <textarea rows={5} value={(draft.recentLoot || []).join('\n')} onChange={(event) => onChange({ ...draft, recentLoot: event.target.value.split('\n').map((entry) => entry.trim()).filter(Boolean) })} />
        </label>
      </div>
      <label>
        <span>Collaborative Notes</span>
        <textarea rows={6} value={draft.notes || ''} onChange={(event) => onChange({ ...draft, notes: event.target.value })} />
      </label>
    </section>
  );
}

function BoardPanel({ boardDraft, setBoardDraft, boardCatalog, onSave }) {
  const [catalogTab, setCatalogTab] = useState('locations');

  const addCard = (entry) => {
    const cardId = `${entry.refType}-${entry.id}-${Date.now()}`;
    setBoardDraft((prev) => ({
      cards: [
        ...prev.cards,
        {
          id: cardId,
          refType: entry.refType,
          refId: entry.id,
          title: entry.title,
          subtitle: entry.subtitle || '',
          note: '',
          status: 'open',
          published: false,
          assignedCharacterId: null,
          lane: null,
        },
      ],
      columns: {
        ...prev.columns,
        hidden: [...prev.columns.hidden, cardId],
      },
    }));
  };

  const onDragStart = (event, cardId) => {
    event.dataTransfer.setData('text/plain', cardId);
  };

  const moveCard = (cardId, targetColumn) => {
    setBoardDraft((prev) => ({
      ...prev,
      columns: {
        hidden: prev.columns.hidden.filter((entry) => entry !== cardId),
        active: prev.columns.active.filter((entry) => entry !== cardId),
        revealed: prev.columns.revealed.filter((entry) => entry !== cardId),
        [targetColumn]: [...prev.columns[targetColumn], cardId],
      },
    }));
  };

  const updateCard = (cardId, patch) => {
    setBoardDraft((prev) => ({
      ...prev,
      cards: prev.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
    }));
  };

  const cardsById = useMemo(
    () => Object.fromEntries((boardDraft.cards || []).map((card) => [card.id, card])),
    [boardDraft.cards]
  );

  return (
    <div className="cp-board-layout">
      <section className="cp-card cp-board-catalog">
        <div className="cp-card__header">
          <h3>Reference Catalog</h3>
          <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={onSave}>
            Save Board
          </button>
        </div>
        <div className="cp-tab-strip cp-tab-strip--small">
          {Object.keys(boardCatalog || {}).map((entry) => (
            <button key={entry} type="button" className={`cp-tab ${catalogTab === entry ? 'cp-tab--active' : ''}`} onClick={() => setCatalogTab(entry)}>
              {entry}
            </button>
          ))}
        </div>
        <div className="cp-board-catalog__list">
          {(boardCatalog?.[catalogTab] || []).map((entry) => (
            <div key={`${entry.refType}-${entry.id}`} className="cp-board-catalog__item">
              <div>
                <strong>{entry.title}</strong>
                <span>{entry.subtitle || entry.refType}</span>
              </div>
              <button type="button" className="cp-chip-btn" onClick={() => addCard(entry)}>
                Add
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="cp-board-columns">
        {BOARD_COLUMNS.map((column) => (
          <section
            key={column.id}
            className="cp-card cp-board-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const cardId = event.dataTransfer.getData('text/plain');
              if (cardId) moveCard(cardId, column.id);
            }}
          >
            <div className="cp-card__header">
              <h3>{column.label}</h3>
              <span>{boardDraft.columns[column.id]?.length || 0}</span>
            </div>
            <div className="cp-board-column__cards">
              {(boardDraft.columns[column.id] || []).map((cardId) => {
                const card = cardsById[cardId];
                if (!card) return null;
                return (
                  <div key={card.id} className="cp-board-card" draggable onDragStart={(event) => onDragStart(event, card.id)}>
                    <div className="cp-board-card__head">
                      <strong>{card.title}</strong>
                      <span>{card.refType}</span>
                    </div>
                    <p>{card.subtitle}</p>
                    <textarea rows={3} value={card.note || ''} onChange={(event) => updateCard(card.id, { note: event.target.value })} placeholder="DM note" />
                    <label className="cp-checkbox">
                      <input type="checkbox" checked={Boolean(card.published)} onChange={(event) => updateCard(card.id, { published: event.target.checked })} />
                      <span>Published to players</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function CampaignPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canUseCampaigns = Boolean(user) && ['player', 'editor', 'admin'].includes(role);
  const [campaigns, setCampaigns] = useState([]);
  const [discoverableCampaigns, setDiscoverableCampaigns] = useState([]);
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [sheetState, setSheetState] = useState(null);
  const [sessionDraft, setSessionDraft] = useState({ title: '', summary: '', notes: '', objectives: [], recentLoot: [], currentLocationId: null });
  const [boardDraft, setBoardDraft] = useState({ cards: [], columns: { hidden: [], active: [], revealed: [] } });
  const [boardCatalog, setBoardCatalog] = useState({ locations: [], regions: [], npcs: [], content: [], secrets: [] });

  const refreshCampaignList = useCallback(async () => {
    if (!canUseCampaigns) {
      setCampaigns([]);
      setDiscoverableCampaigns([]);
      return;
    }
    const data = await apiJson(`${API}/campaigns/me`);
    setCampaigns(data.campaigns || []);
    setDiscoverableCampaigns(data.discoverableCampaigns || []);
    setActiveCampaignId((prev) => prev || data.campaigns?.[0]?.id || null);
  }, [canUseCampaigns]);

  const refreshCharacters = useCallback(async () => {
    if (!canUseCampaigns) {
      setPlayerCharacters([]);
      return;
    }
    const data = await apiJson(`${API}/player-characters/me`);
    setPlayerCharacters(data.characters || []);
  }, [canUseCampaigns]);

  const refreshActiveCampaign = useCallback(async (campaignId = activeCampaignId) => {
    if (!campaignId || !canUseCampaigns) {
      setActiveCampaign(null);
      return;
    }
    const data = await apiJson(`${API}/campaigns/${campaignId}`);
    setActiveCampaign(data.campaign);
  }, [activeCampaignId, canUseCampaigns]);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      if (!canUseCampaigns) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [campaignData, characterData] = await Promise.all([
          apiJson(`${API}/campaigns/me`),
          apiJson(`${API}/player-characters/me`),
        ]);
        if (cancelled) return;
        setCampaigns(campaignData.campaigns || []);
        setDiscoverableCampaigns(campaignData.discoverableCampaigns || []);
        setPlayerCharacters(characterData.characters || []);
        setActiveCampaignId((prev) => prev || campaignData.campaigns?.[0]?.id || null);
      } catch (error) {
        toast.error(error.message || 'Unable to load campaigns.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [canUseCampaigns, toast]);

  useEffect(() => {
    if (!activeCampaignId || !canUseCampaigns) {
      setActiveCampaign(null);
      return;
    }
    refreshActiveCampaign().catch((error) => {
      toast.error(error.message || 'Unable to load campaign.');
    });
  }, [activeCampaignId, canUseCampaigns, refreshActiveCampaign, toast]);

  useEffect(() => {
    if (!activeCampaign?.sessionState) return;
    setSessionDraft(activeCampaign.sessionState);
  }, [activeCampaign]);

  useEffect(() => {
    if (!activeCampaign?.boardState) return;
    setBoardDraft(activeCampaign.boardState);
  }, [activeCampaign]);

  useEffect(() => {
    if (activeTab !== 'DM Board' || !activeCampaign?.canManage) return;
    apiJson(`${API}/campaigns/${activeCampaign.id}/board`)
      .then((data) => {
        setBoardDraft(data.boardState);
        setBoardCatalog(data.catalog || { locations: [], regions: [], npcs: [], content: [], secrets: [] });
      })
      .catch((error) => {
        toast.error(error.message || 'Unable to load DM board.');
      });
  }, [activeCampaign?.canManage, activeCampaign?.id, activeTab, toast]);

  const overviewStats = useMemo(() => {
    if (!activeCampaign) return [];
    return [
      ['Approved Players', activeCampaign.members?.length || 0],
      ['Pending Requests', activeCampaign.pendingMembers?.length || 0],
      ['Attached Characters', activeCampaign.attachedCharacters?.length || 0],
      ['Party Items', activeCampaign.inventory?.items?.length || 0],
    ];
  }, [activeCampaign]);

  const handleCampaignCreated = async (campaign) => {
    setShowCreateCampaign(false);
    await refreshCampaignList();
    setActiveCampaignId(campaign.id);
  };

  const handleCampaignUpdated = async (campaign) => {
    setShowEditCampaign(false);
    await refreshCampaignList();
    await refreshActiveCampaign(campaign.id || activeCampaignId);
  };

  const handleCampaignDeleted = async (campaignId) => {
    setShowEditCampaign(false);
    if (String(activeCampaignId) === String(campaignId)) {
      setActiveCampaignId(null);
      setActiveCampaign(null);
      setActiveTab('Overview');
    }
    await refreshCampaignList();
  };

  const handleJoinRequest = async (campaignId) => {
    try {
      await apiJson(`${API}/campaigns/${campaignId}/join`, { method: 'POST' });
      toast.success('Join request sent.');
      await refreshCampaignList();
      setActiveCampaignId(campaignId);
      await refreshActiveCampaign(campaignId);
    } catch (error) {
      toast.error(error.message || 'Unable to request campaign access.');
    }
  };

  const handleMembershipChange = async (userId, patch) => {
    await apiJson(`${API}/campaigns/${activeCampaign.id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await Promise.all([refreshCampaignList(), refreshActiveCampaign()]);
  };

  const handleMembershipRemove = async (userId) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/members/${userId}`, { method: 'DELETE' });
      toast.success('Member removed.');
      await Promise.all([refreshCampaignList(), refreshActiveCampaign()]);
    } catch (error) {
      toast.error(error.message || 'Unable to remove member.');
    }
  };

  const handleAttachCharacter = async (characterId) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/characters/attach`, {
        method: 'POST',
        body: JSON.stringify({ characterId }),
      });
      toast.success('Character attached to campaign.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to attach character.');
    }
  };

  const handleDetachCharacter = async (characterId) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/characters/${characterId}`, { method: 'DELETE' });
      toast.success('Character detached from campaign.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to detach character.');
    }
  };

  const handleSaveAttachment = async (characterId, patch) => {
    await apiJson(`${API}/campaigns/${activeCampaign.id}/characters/${characterId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await refreshActiveCampaign();
  };

  const handleOpenSheet = (character, canEdit) => {
    setSheetState({ character, canEdit });
  };

  const handleSheetSaved = async () => {
    setSheetState(null);
    await Promise.all([refreshCharacters(), refreshActiveCampaign()]);
  };

  const handleCreateItem = async (item) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/inventory/items`, {
        method: 'POST',
        body: JSON.stringify(item),
      });
      toast.success('Item added to party stash.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to create item.');
    }
  };

  const handleMoveItem = async (itemId, ownerType, ownerId = null) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/inventory/move`, {
        method: 'POST',
        body: JSON.stringify({ itemId, ownerType, ownerId }),
      });
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to move item.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/inventory/items/${itemId}`, {
        method: 'DELETE',
      });
      toast.success('Item deleted.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to delete item.');
    }
  };

  const handleSaveSession = async () => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/session`, {
        method: 'PATCH',
        body: JSON.stringify(sessionDraft),
      });
      toast.success('Session workspace saved.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to save session.');
    }
  };

  const handleSaveBoard = async () => {
    try {
      await apiJson(`${API}/campaigns/${activeCampaign.id}/board`, {
        method: 'PATCH',
        body: JSON.stringify(boardDraft),
      });
      toast.success('DM board saved.');
      await refreshActiveCampaign();
    } catch (error) {
      toast.error(error.message || 'Unable to save DM board.');
    }
  };

  if (!canUseCampaigns) {
    return (
      <div className="cp-page cp-page--guest">
        <div className="cp-guest-hero">
          <div className="cp-guest-emblem">⚔️</div>
          <h1 className="cp-guest-title">Campaign Workspace</h1>
          <p className="cp-guest-sub">Sign in to join campaigns, manage characters, and coordinate the party.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading campaigns…</p>
      </div>
    );
  }

  return (
    <div className="cp-page cp-page--workspace">
      {sheetState && (
        <CharacterSheetModal
          character={sheetState.character}
          campaignId={activeCampaign?.id || null}
          canEdit={sheetState.canEdit}
          onClose={() => setSheetState(null)}
          onSaved={handleSheetSaved}
        />
      )}

      {showCreateCampaign && (
        <CampaignSettingsModal
          mode="create"
          onClose={() => setShowCreateCampaign(false)}
          onSaved={handleCampaignCreated}
        />
      )}

      {showEditCampaign && activeCampaign && activeCampaign.canManage && (
        <CampaignSettingsModal
          mode="edit"
          campaign={activeCampaign}
          canDelete={activeCampaign.viewerRole === 'owner' || role === 'admin'}
          onClose={() => setShowEditCampaign(false)}
          onSaved={handleCampaignUpdated}
          onDeleted={handleCampaignDeleted}
        />
      )}

      <header className="cp-header cp-header--workspace">
        <div className="cp-header__left">
          <p className="cp-header__eyebrow">Azterra</p>
          <h1 className="cp-header__title">Campaign Workspace</h1>
          <p className="cp-header__subtitle">Build the party, manage items, run the session, and keep DM-only prep in one place.</p>
        </div>
        <div className="cp-header__actions">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setSheetState({ character: null, canEdit: true })}>
            + New Character
          </button>
          <button type="button" className="cp-btn cp-btn--primary" onClick={() => setShowCreateCampaign(true)}>
            + New Campaign
          </button>
        </div>
      </header>

      <div className="cp-layout cp-layout--workspace">
        <aside className="cp-sidebar cp-sidebar--workspace">
          <section className="cp-sidebar__section">
            <div className="cp-sidebar__section-head">
              <h2>My Campaigns</h2>
              <span>{campaigns.length}</span>
            </div>
            {campaigns.length === 0 ? (
              <p className="cp-empty">No campaign memberships yet.</p>
            ) : (
              <div className="cp-campaign-list">
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    className={`cp-campaign-item ${activeCampaignId === campaign.id ? 'cp-campaign-item--active' : ''}`}
                    onClick={() => setActiveCampaignId(campaign.id)}
                  >
                    <div className="cp-campaign-item__body">
                      <strong>{campaign.name}</strong>
                      <span>{campaign.viewerStatus === 'pending' ? 'Pending approval' : `${campaign.attachedCharacterCount} attached characters`}</span>
                      {campaign.description && <p>{campaign.description}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="cp-sidebar__section">
            <div className="cp-sidebar__section-head">
              <h2>Discover</h2>
              <span>{discoverableCampaigns.length}</span>
            </div>
            {discoverableCampaigns.length === 0 ? (
              <p className="cp-empty">No open campaigns right now.</p>
            ) : (
              <div className="cp-discover-list">
                {discoverableCampaigns.map((campaign) => (
                  <div key={campaign.id} className="cp-discover-card">
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.ownerName}</span>
                      {campaign.description && <p>{campaign.description}</p>}
                    </div>
                    <button type="button" className="cp-chip-btn" onClick={() => handleJoinRequest(campaign.id)}>
                      Request Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="cp-main cp-main--workspace">
          {!activeCampaign ? (
            <div className="cp-main__empty">
              <p className="cp-main__empty-icon">🗺️</p>
              <p>Select a campaign to open its workspace.</p>
            </div>
          ) : activeCampaign.pendingOnly ? (
            <section className="cp-card cp-card--pending">
              <h2>{activeCampaign.name}</h2>
              <p>{activeCampaign.description}</p>
              <p>Your request is pending DM approval.</p>
            </section>
          ) : (
            <>
              <section className="cp-campaign-hero">
                <div>
                  <p className="cp-campaign-hero__eyebrow">Owner DM · {activeCampaign.ownerName}</p>
                  <h2>{activeCampaign.name}</h2>
                  <p>{activeCampaign.description || 'No campaign description yet.'}</p>
                </div>
                <div className="cp-campaign-hero__aside">
                  {activeCampaign.canManage && (
                    <div className="cp-campaign-hero__actions">
                      <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setShowEditCampaign(true)}>
                        Edit Campaign
                      </button>
                    </div>
                  )}
                  <div className="cp-campaign-hero__meta">
                    <span>{activeCampaign.members.length} approved members</span>
                    <span>{activeCampaign.attachedCharacters.length} attached characters</span>
                    <span>{activeCampaign.inventory?.items?.length || 0} items in play</span>
                  </div>
                </div>
              </section>

              <div className="cp-tab-strip">
                {CAMPAIGN_TABS.filter((tab) => tab !== 'DM Board' || activeCampaign.canManage).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`cp-tab ${activeTab === tab ? 'cp-tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === 'Overview' && (
                <div className="cp-overview">
                  <div className="cp-overview-grid cp-overview-grid--stats">
                    {overviewStats.map(([label, value]) => (
                      <section key={label} className="cp-card cp-stat-card">
                        <strong>{value}</strong>
                        <span>{label}</span>
                      </section>
                    ))}
                  </div>
                  <MemberList
                    campaign={activeCampaign}
                    onMembershipChange={handleMembershipChange}
                    onMembershipRemove={handleMembershipRemove}
                  />
                </div>
              )}

              {activeTab === 'Party' && (
                <PartyPanel
                  campaign={activeCampaign}
                  onOpenSheet={handleOpenSheet}
                  onSaveAttachment={handleSaveAttachment}
                  onDetachCharacter={handleDetachCharacter}
                />
              )}

              {activeTab === 'Characters' && (
                <CharactersPanel
                  campaign={activeCampaign}
                  playerCharacters={playerCharacters}
                  onOpenSheet={handleOpenSheet}
                  onAttachCharacter={handleAttachCharacter}
                />
              )}

              {activeTab === 'Inventory' && (
                <InventoryPanel
                  campaign={activeCampaign}
                  onCreateItem={handleCreateItem}
                  onMoveItem={handleMoveItem}
                  onDeleteItem={handleDeleteItem}
                />
              )}

              {activeTab === 'Session' && (
                <SessionPanel
                  campaign={activeCampaign}
                  draft={sessionDraft}
                  onChange={setSessionDraft}
                  onSave={handleSaveSession}
                />
              )}

              {activeTab === 'DM Board' && activeCampaign.canManage && (
                <BoardPanel
                  boardDraft={boardDraft}
                  setBoardDraft={setBoardDraft}
                  boardCatalog={boardCatalog}
                  onSave={handleSaveBoard}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
