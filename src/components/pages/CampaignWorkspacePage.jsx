import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CampaignSettingsModal,
  CharacterSheetModal,
  apiJson,
  calculatePassivePerception,
  mod,
} from './CampaignShared';
import './CampaignPage.css';
import './CampaignWorkspacePage.css';

const CARD_SIZES = {
  compact: { width: 228, height: 140 },
  standard: { width: 280, height: 176 },
  large: { width: 340, height: 224 },
};

const SURFACE_SIZE = { width: 1560, height: 920 };
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.45;
const ZOOM_STEP = 0.1;

const WIDGET_TEMPLATES = [
  { id: 'healing-potion', label: 'Healing Potion', accent: '#d66b5f', emoji: '🧪', payload: { note: 'Restores HP', amount: 1 } },
  { id: 'damage-counter', label: 'Damage / Heal', accent: '#cfaa68', emoji: '✶', payload: { value: 0 } },
  { id: 'condition-chip', label: 'Condition', accent: '#8fb86f', emoji: '☍', payload: { note: 'Status marker' } },
  { id: 'note-token', label: 'Note', accent: '#7fb7d8', emoji: '✎', payload: { note: 'Table note' } },
  { id: 'status-marker', label: 'Status Marker', accent: '#b78be2', emoji: '◆', payload: { note: 'Track a moment' } },
  { id: 'progress-bar', label: 'Progress', accent: '#e4c770', emoji: '▤', payload: { value: 50 } },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asTagArray(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sizeLabel(size) {
  if (size === 'large') return 'Large';
  if (size === 'standard') return 'Standard';
  return 'Compact';
}

function findTemplate(type) {
  return WIDGET_TEMPLATES.find((entry) => entry.id === type) || null;
}

function cardMetrics(size) {
  return CARD_SIZES[size] || CARD_SIZES.compact;
}

function dragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer.getData('application/azterra-campaign'));
  } catch {
    return null;
  }
}

function setDragPayload(event, payload) {
  event.dataTransfer.setData('application/azterra-campaign', JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
}

function CompactCard({ character, cardState, selected, spotlighted, canManage, editMode, onSelect, onResize, onDragStart, onOpenSheet, onWidgetDrop, attachedWidgets }) {
  const metrics = cardMetrics(cardState?.size);
  const attachment = character.attachment || {};

  return (
    <article
      className={`cpt-card cpt-card--${cardState?.size || 'compact'} ${selected ? 'cpt-card--selected' : ''} ${spotlighted ? 'cpt-card--spotlight' : ''}`}
      style={{
        width: metrics.width,
        minHeight: metrics.height,
        left: cardState?.x || 0,
        top: cardState?.y || 0,
        zIndex: cardState?.zIndex || 1,
        '--char-accent': character.color || '#cfaa68',
      }}
      draggable={Boolean(canManage && editMode)}
      onDragStart={(event) => onDragStart(event, character.id)}
      onClick={() => onSelect(character.id)}
      onDragOver={(event) => {
        if (!canManage || !editMode) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canManage || !editMode) return;
        event.preventDefault();
        event.stopPropagation();
        onWidgetDrop(event, character.id);
      }}
    >
      <div className="cpt-card__header">
        <div className="cpt-card__identity">
          <span className="cpt-card__owner">{character.ownerName}</span>
          <h3>{attachment.nickname || character.name || 'Unnamed Character'}</h3>
          <p>{[character.race, character.class].filter(Boolean).join(' · ')}{character.level ? ` · Lv ${character.level}` : ''}</p>
        </div>
        {canManage && editMode && (
          <button
            type="button"
            className="cpt-card__size-btn"
            onClick={(event) => {
              event.stopPropagation();
              onResize(character.id);
            }}
          >
            {sizeLabel(cardState?.size)}
          </button>
        )}
      </div>

      <div className="cpt-card__stats">
        <div>
          <span>HP</span>
          <strong>{attachment.currentHp ?? character.hp}/{attachment.maxHp ?? character.maxHp}</strong>
        </div>
        <div>
          <span>AC</span>
          <strong>{character.ac ?? '—'}</strong>
        </div>
        <div>
          <span>Speed</span>
          <strong>{character.speed ?? '—'}</strong>
        </div>
        <div>
          <span>Init</span>
          <strong>{character.initiative ?? mod(character.stats?.dex)}</strong>
        </div>
        <div>
          <span>Passive</span>
          <strong>{calculatePassivePerception(character)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{attachment.status || 'active'}</strong>
        </div>
      </div>

      {(attachedWidgets?.length || attachment.tags?.length) > 0 && (
        <div className="cpt-card__tokens">
          {(attachment.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="cpt-token cpt-token--condition">{tag}</span>
          ))}
          {(attachedWidgets || []).slice(0, 3).map((widget) => {
            const template = findTemplate(widget.type);
            return (
              <span key={widget.id} className="cpt-token" style={{ '--token-accent': template?.accent || '#cfaa68' }}>
                <span aria-hidden="true">{template?.emoji || '◆'}</span>
                {template?.label || widget.type}
              </span>
            );
          })}
        </div>
      )}

      <div className="cpt-card__footer">
        <button type="button" className="cp-chip-btn" onClick={(event) => {
          event.stopPropagation();
          onSelect(character.id);
        }}>
          Inspect
        </button>
        <button type="button" className="cp-chip-btn" onClick={(event) => {
          event.stopPropagation();
          onOpenSheet(character, character.canEditSheet);
        }}>
          {character.canEditSheet ? 'Edit Sheet' : 'View Sheet'}
        </button>
      </div>
    </article>
  );
}

function SurfaceWidget({ widget, editMode, canManage, onDragStart, onRemove }) {
  const template = findTemplate(widget.type);

  return (
    <button
      type="button"
      className="cpt-widget"
      style={{
        left: widget.x || 0,
        top: widget.y || 0,
        zIndex: widget.zIndex || 2,
        '--widget-accent': template?.accent || '#cfaa68',
      }}
      draggable={Boolean(canManage && editMode)}
      onDragStart={(event) => onDragStart(event, widget.id)}
      onClick={(event) => event.stopPropagation()}
      title={template?.label || widget.type}
    >
      <span className="cpt-widget__icon" aria-hidden="true">{template?.emoji || '◆'}</span>
      <span className="cpt-widget__label">{template?.label || widget.type}</span>
      {canManage && editMode && (
        <span
          className="cpt-widget__remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(widget.id);
          }}
        >
          ×
        </span>
      )}
    </button>
  );
}

function TableShelf({ canManage, editMode }) {
  return (
    <section className={`cpt-shelf ${!canManage || !editMode ? 'cpt-shelf--locked' : ''}`}>
      <div className="cpt-shelf__head">
        <div>
          <p className="cpt-shelf__eyebrow">Play Widget Shelf</p>
          <h3>Drag tabletop aids onto the board</h3>
        </div>
        <span>{canManage && editMode ? 'Drop onto the table or a character card' : 'DM edit mode required'}</span>
      </div>
      <div className="cpt-shelf__items">
        {WIDGET_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="cpt-shelf__item"
            draggable={Boolean(canManage && editMode)}
            onDragStart={(event) => setDragPayload(event, { kind: 'template', templateId: template.id })}
            style={{ '--widget-accent': template.accent }}
          >
            <span className="cpt-shelf__icon" aria-hidden="true">{template.emoji}</span>
            <span className="cpt-shelf__label">{template.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CampaignInspector({
  campaign,
  selectedCharacter,
  attachmentDraft,
  setAttachmentDraft,
  canEditAttachment,
  savingAttachment,
  onSaveAttachment,
  onOpenSheet,
  spotlighted,
  onToggleSpotlight,
  onDetachCharacter,
}) {
  if (!selectedCharacter) {
    return (
      <aside className="cpt-inspector">
        <div className="cpt-inspector__empty">
          <p className="cpt-inspector__eyebrow">Inspector</p>
          <h3>Select a party card</h3>
          <p>Inspect character details, inventory, conditions, and quick play stats from here without leaving the tabletop.</p>
        </div>
      </aside>
    );
  }

  const attachment = selectedCharacter.attachment || {};
  const inventoryItems = selectedCharacter.inventoryItems || [];

  return (
    <aside className="cpt-inspector">
      <div className="cpt-inspector__hero" style={{ '--char-accent': selectedCharacter.color || '#cfaa68' }}>
        <div>
          <p className="cpt-inspector__eyebrow">{selectedCharacter.ownerName}</p>
          <h3>{attachment.nickname || selectedCharacter.name}</h3>
          <span>{[selectedCharacter.race, selectedCharacter.class].filter(Boolean).join(' · ')}{selectedCharacter.level ? ` · Lv ${selectedCharacter.level}` : ''}</span>
        </div>
        <div className="cpt-inspector__hero-actions">
          <button type="button" className="cp-chip-btn" onClick={() => onToggleSpotlight(selectedCharacter.id)}>
            {spotlighted ? 'Unfocus' : 'Focus'}
          </button>
          <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(selectedCharacter, selectedCharacter.canEditSheet)}>
            {selectedCharacter.canEditSheet ? 'Open Full Sheet' : 'View Sheet'}
          </button>
          {selectedCharacter.canEditAttachment && (
            <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onDetachCharacter(selectedCharacter.id)}>
              Detach
            </button>
          )}
        </div>
      </div>

      <section className="cpt-inspector__section">
        <div className="cpt-inspector__stats">
          <div><span>HP</span><strong>{attachment.currentHp ?? selectedCharacter.hp}/{attachment.maxHp ?? selectedCharacter.maxHp}</strong></div>
          <div><span>AC</span><strong>{selectedCharacter.ac ?? '—'}</strong></div>
          <div><span>Speed</span><strong>{selectedCharacter.speed ?? '—'}</strong></div>
          <div><span>Init</span><strong>{selectedCharacter.initiative ?? mod(selectedCharacter.stats?.dex)}</strong></div>
          <div><span>Passive</span><strong>{calculatePassivePerception(selectedCharacter)}</strong></div>
          <div><span>Prof.</span><strong>{selectedCharacter.proficiencyBonus ?? '—'}</strong></div>
        </div>
      </section>

      <section className="cpt-inspector__section">
        <div className="cpt-inspector__section-head">
          <h4>Conditions & Resources</h4>
        </div>
        {canEditAttachment ? (
          <div className="cpt-form">
            <div className="cpt-form__row">
              <label>
                <span>Current HP</span>
                <input type="number" value={attachmentDraft.currentHp ?? ''} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, currentHp: event.target.value === '' ? null : Number(event.target.value) }))} />
              </label>
              <label>
                <span>Max HP</span>
                <input type="number" value={attachmentDraft.maxHp ?? ''} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, maxHp: event.target.value === '' ? null : Number(event.target.value) }))} />
              </label>
            </div>
            <label>
              <span>Status</span>
              <input value={attachmentDraft.status || 'active'} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, status: event.target.value }))} />
            </label>
            <label>
              <span>Condition Tags</span>
              <input value={(attachmentDraft.tags || []).join(', ')} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, tags: asTagArray(event.target.value) }))} placeholder="Blessed, Hidden, Concentrating" />
            </label>
            <label>
              <span>Table Notes</span>
              <textarea rows={4} value={attachmentDraft.notes || ''} onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={onSaveAttachment} disabled={savingAttachment}>
              {savingAttachment ? 'Saving…' : 'Save Table State'}
            </button>
          </div>
        ) : (
          <div className="cpt-readout">
            <div className="cpt-token-row">
              {(attachment.tags || []).length === 0 ? (
                <span className="cpt-empty-inline">No active conditions.</span>
              ) : (
                (attachment.tags || []).map((tag) => <span key={tag} className="cpt-token cpt-token--condition">{tag}</span>)
              )}
            </div>
            <p>{attachment.notes || 'No campaign-only notes yet.'}</p>
          </div>
        )}
      </section>

      <section className="cpt-inspector__section">
        <div className="cpt-inspector__section-head">
          <h4>Inventory</h4>
          <span>{inventoryItems.length}</span>
        </div>
        {inventoryItems.length === 0 ? (
          <p className="cpt-empty-inline">No campaign items assigned.</p>
        ) : (
          <ul className="cpt-list">
            {inventoryItems.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.type} · qty {item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
        {(selectedCharacter.equipment || []).length > 0 && (
          <div className="cpt-inspector__subsection">
            <h5>Sheet Equipment</h5>
            <p>{selectedCharacter.equipment.join(', ')}</p>
          </div>
        )}
      </section>

      <section className="cpt-inspector__section">
        <div className="cpt-inspector__section-head">
          <h4>Sheet Snapshot</h4>
        </div>
        <div className="cpt-sheet-grid">
          <div><span>Background</span><strong>{selectedCharacter.background || '—'}</strong></div>
          <div><span>Alignment</span><strong>{selectedCharacter.alignment || '—'}</strong></div>
          <div><span>Hit Dice</span><strong>{selectedCharacter.hitDice || '—'}</strong></div>
          <div><span>Notes</span><strong>{selectedCharacter.notes || '—'}</strong></div>
        </div>
      </section>
    </aside>
  );
}

function TableSidebar({
  campaign,
  playerCharacters,
  attachedIds,
  drawerTab,
  setDrawerTab,
  onAttachCharacter,
  onMembershipChange,
  onOpenSheet,
}) {
  return (
    <aside className="cpt-sidebar">
      <div className="cpt-sidebar__tabs">
        {['Roster', 'Library', 'Requests'].filter((entry) => entry !== 'Requests' || campaign.canManage).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`cpt-sidebar__tab ${drawerTab === entry ? 'cpt-sidebar__tab--active' : ''}`}
            onClick={() => setDrawerTab(entry)}
          >
            {entry}
          </button>
        ))}
      </div>

      {drawerTab === 'Roster' && (
        <div className="cpt-sidebar__panel">
          <div className="cpt-sidebar__section">
            <div className="cpt-sidebar__section-head">
              <h4>Party Members</h4>
              <span>{campaign.members?.length || 0}</span>
            </div>
            <div className="cpt-sidebar__list">
              <div className="cpt-sidebar__entry cpt-sidebar__entry--owner">
                <strong>{campaign.ownerName}</strong>
                <span>Campaign Owner DM</span>
              </div>
              {(campaign.members || []).map((member) => (
                <div key={member.userId} className="cpt-sidebar__entry">
                  <strong>{member.name}</strong>
                  <span>{member.isCoDm ? 'Co-DM' : 'Player'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerTab === 'Library' && (
        <div className="cpt-sidebar__panel">
          <div className="cpt-sidebar__section">
            <div className="cpt-sidebar__section-head">
              <h4>My Character Library</h4>
              <span>{playerCharacters.length}</span>
            </div>
            <div className="cpt-sidebar__list">
              {playerCharacters.length === 0 ? (
                <p className="cpt-empty-inline">Create a reusable character to add it to the table.</p>
              ) : (
                playerCharacters.map((character) => (
                  <div key={character.id} className="cpt-sidebar__entry">
                    <div>
                      <strong>{character.name || 'Unnamed Character'}</strong>
                      <span>{[character.race, character.class].filter(Boolean).join(' · ') || 'Character sheet'}</span>
                    </div>
                    <div className="cpt-sidebar__actions">
                      <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(character, true)}>
                        Edit
                      </button>
                      <button type="button" className="cp-chip-btn" onClick={() => onAttachCharacter(character.id)} disabled={attachedIds.has(String(character.id))}>
                        {attachedIds.has(String(character.id)) ? 'Attached' : 'Attach'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {drawerTab === 'Requests' && campaign.canManage && (
        <div className="cpt-sidebar__panel">
          <div className="cpt-sidebar__section">
            <div className="cpt-sidebar__section-head">
              <h4>Pending Requests</h4>
              <span>{campaign.pendingMembers?.length || 0}</span>
            </div>
            <div className="cpt-sidebar__list">
              {(campaign.pendingMembers || []).length === 0 ? (
                <p className="cpt-empty-inline">No pending approvals.</p>
              ) : (
                (campaign.pendingMembers || []).map((member) => (
                  <div key={member.userId} className="cpt-sidebar__entry">
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.email || member.username || 'Pending player'}</span>
                    </div>
                    <div className="cpt-sidebar__actions">
                      <button type="button" className="cp-chip-btn" onClick={() => onMembershipChange(member.userId, { status: 'approved', role: member.role || 'player' })}>
                        Approve
                      </button>
                      <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onMembershipChange(member.userId, { status: 'rejected', role: 'player' })}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function CampaignWorkspacePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const surfaceRef = useRef(null);
  const canUseCampaigns = Boolean(user) && ['player', 'editor', 'admin'].includes(role);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [tableState, setTableState] = useState({ cards: [], widgets: [] });
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [spotlightCharacterId, setSpotlightCharacterId] = useState(null);
  const [viewZoom, setViewZoom] = useState(1);
  const [drawerTab, setDrawerTab] = useState('Roster');
  const [editMode, setEditMode] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [savingAttachment, setSavingAttachment] = useState(false);
  const [sheetState, setSheetState] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [attachmentDraft, setAttachmentDraft] = useState({ currentHp: null, maxHp: null, status: 'active', tags: [], notes: '' });

  const loadWorkspace = useCallback(async () => {
    if (!canUseCampaigns || !id) {
      setCampaign(null);
      setTableState({ cards: [], widgets: [] });
      return;
    }

    const [campaignData, characterData] = await Promise.all([
      apiJson(`/api/campaigns/${id}/table`),
      apiJson('/api/player-characters/me'),
    ]);
    setCampaign(campaignData.campaign || null);
    setTableState(campaignData.campaign?.tableState || { cards: [], widgets: [] });
    setPlayerCharacters(characterData.characters || []);
  }, [canUseCampaigns, id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!canUseCampaigns) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [campaignData, characterData] = await Promise.all([
          apiJson(`/api/campaigns/${id}/table`),
          apiJson('/api/player-characters/me'),
        ]);
        if (cancelled) return;
        setCampaign(campaignData.campaign || null);
        setTableState(campaignData.campaign?.tableState || { cards: [], widgets: [] });
        setPlayerCharacters(characterData.characters || []);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'Unable to load campaign tabletop.');
          navigate('/campaign');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [canUseCampaigns, id, navigate, toast]);

  useEffect(() => {
    const attachedCharacters = campaign?.attachedCharacters || [];
    if (attachedCharacters.length === 0) {
      setSelectedCharacterId(null);
      return;
    }
    if (!attachedCharacters.some((entry) => String(entry.id) === String(selectedCharacterId))) {
      setSelectedCharacterId(String(attachedCharacters[0].id));
    }
  }, [campaign?.attachedCharacters, selectedCharacterId]);

  const selectedCharacter = useMemo(
    () => (campaign?.attachedCharacters || []).find((entry) => String(entry.id) === String(selectedCharacterId)) || null,
    [campaign?.attachedCharacters, selectedCharacterId]
  );

  useEffect(() => {
    if (!selectedCharacter) {
      setAttachmentDraft({ currentHp: null, maxHp: null, status: 'active', tags: [], notes: '' });
      return;
    }
    setAttachmentDraft({
      currentHp: selectedCharacter.attachment?.currentHp ?? selectedCharacter.hp ?? null,
      maxHp: selectedCharacter.attachment?.maxHp ?? selectedCharacter.maxHp ?? null,
      status: selectedCharacter.attachment?.status || 'active',
      tags: selectedCharacter.attachment?.tags || [],
      notes: selectedCharacter.attachment?.notes || '',
    });
  }, [selectedCharacter]);

  const attachedIds = useMemo(
    () => new Set((campaign?.attachedCharacters || []).map((entry) => String(entry.id))),
    [campaign?.attachedCharacters]
  );

  const cardsByCharacterId = useMemo(
    () => Object.fromEntries((tableState.cards || []).map((card) => [String(card.characterId), card])),
    [tableState.cards]
  );

  const widgetsByCharacterId = useMemo(() => {
    const grouped = {};
    (tableState.widgets || []).forEach((widget) => {
      if (!widget.attachedToCharacterId) return;
      const key = String(widget.attachedToCharacterId);
      grouped[key] = grouped[key] || [];
      grouped[key].push(widget);
    });
    return grouped;
  }, [tableState.widgets]);

  const detachedWidgets = useMemo(
    () => (tableState.widgets || []).filter((widget) => !widget.attachedToCharacterId),
    [tableState.widgets]
  );

  const canManage = Boolean(campaign?.canManage);

  const persistTable = useCallback(async (nextTableState) => {
    if (!canManage || !campaign?.id) {
      setTableState(nextTableState);
      return;
    }

    const previous = tableState;
    setTableState(nextTableState);
    setSavingTable(true);
    try {
      const data = await apiJson(`/api/campaigns/${campaign.id}/table`, {
        method: 'PATCH',
        body: JSON.stringify(nextTableState),
      });
      setTableState(data.tableState || nextTableState);
      setCampaign((prev) => (prev ? { ...prev, tableState: data.tableState || nextTableState } : prev));
    } catch (error) {
      setTableState(previous);
      toast.error(error.message || 'Unable to save tabletop layout.');
    } finally {
      setSavingTable(false);
    }
  }, [campaign?.id, canManage, tableState, toast]);

  const cardDropPosition = (event, size = 'compact') => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const metrics = cardMetrics(size);
    const x = (event.clientX - rect.left) / viewZoom - metrics.width / 2;
    const y = (event.clientY - rect.top) / viewZoom - metrics.height / 2;
    return {
      x: clamp(Math.round(x), 16, SURFACE_SIZE.width - metrics.width - 16),
      y: clamp(Math.round(y), 16, SURFACE_SIZE.height - metrics.height - 16),
    };
  };

  const widgetDropPosition = (event) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = (event.clientX - rect.left) / viewZoom - 36;
    const y = (event.clientY - rect.top) / viewZoom - 18;
    return {
      x: clamp(Math.round(x), 12, SURFACE_SIZE.width - 120),
      y: clamp(Math.round(y), 12, SURFACE_SIZE.height - 48),
    };
  };

  const nextCardSize = (size) => {
    if (size === 'compact') return 'standard';
    if (size === 'standard') return 'large';
    return 'compact';
  };

  const handleCardResize = (characterId) => {
    if (!canManage || !editMode) return;
    const current = cardsByCharacterId[String(characterId)];
    const nextCards = (tableState.cards || []).map((card) =>
      String(card.characterId) === String(characterId)
        ? { ...card, size: nextCardSize(card.size || 'compact') }
        : card
    );
    persistTable({ ...tableState, cards: nextCards });
  };

  const handleCardDragStart = (event, characterId) => {
    if (!canManage || !editMode) return;
    setDragPayload(event, { kind: 'card', characterId: String(characterId) });
  };

  const createWidget = (templateId, position, attachedToCharacterId = null) => {
    const template = findTemplate(templateId);
    return {
      id: `widget-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: templateId,
      x: position.x,
      y: position.y,
      attachedToCharacterId,
      payload: { ...(template?.payload || {}) },
      zIndex: (tableState.widgets || []).length + 2,
    };
  };

  const moveCardToSurface = (characterId, position) => {
    const nextCards = (tableState.cards || []).map((card) =>
      String(card.characterId) === String(characterId)
        ? {
            ...card,
            x: position.x,
            y: position.y,
            zIndex: Math.max(...(tableState.cards || []).map((entry) => Number(entry.zIndex) || 1), 1) + 1,
          }
        : card
    );
    persistTable({ ...tableState, cards: nextCards });
  };

  const moveWidget = (widgetId, patch) => {
    const nextWidgets = (tableState.widgets || []).map((widget) =>
      String(widget.id) === String(widgetId)
        ? { ...widget, ...patch }
        : widget
    );
    persistTable({ ...tableState, widgets: nextWidgets });
  };

  const handleSurfaceDrop = (event) => {
    if (!canManage || !editMode) return;
    event.preventDefault();
    const payload = dragPayload(event);
    if (!payload) return;

    if (payload.kind === 'card') {
      const card = cardsByCharacterId[String(payload.characterId)];
      moveCardToSurface(payload.characterId, cardDropPosition(event, card?.size || 'compact'));
      return;
    }

    if (payload.kind === 'template') {
      const nextWidget = createWidget(payload.templateId, widgetDropPosition(event), null);
      persistTable({ ...tableState, widgets: [...(tableState.widgets || []), nextWidget] });
      return;
    }

    if (payload.kind === 'widget') {
      moveWidget(payload.widgetId, {
        ...widgetDropPosition(event),
        attachedToCharacterId: null,
        zIndex: Math.max(...(tableState.widgets || []).map((entry) => Number(entry.zIndex) || 1), 1) + 1,
      });
    }
  };

  const handleWidgetDropOnCharacter = (event, characterId) => {
    const payload = dragPayload(event);
    if (!payload) return;

    if (payload.kind === 'template') {
      const nextWidget = createWidget(payload.templateId, { x: 0, y: 0 }, String(characterId));
      persistTable({ ...tableState, widgets: [...(tableState.widgets || []), nextWidget] });
      return;
    }

    if (payload.kind === 'widget') {
      moveWidget(payload.widgetId, { attachedToCharacterId: String(characterId) });
    }
  };

  const handleWidgetDragStart = (event, widgetId) => {
    if (!canManage || !editMode) return;
    setDragPayload(event, { kind: 'widget', widgetId: String(widgetId) });
  };

  const handleRemoveWidget = (widgetId) => {
    const nextWidgets = (tableState.widgets || []).filter((widget) => String(widget.id) !== String(widgetId));
    persistTable({ ...tableState, widgets: nextWidgets });
  };

  const handleSaveAttachment = async () => {
    if (!selectedCharacter || !selectedCharacter.canEditAttachment) return;
    setSavingAttachment(true);
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/${selectedCharacter.id}`, {
        method: 'PATCH',
        body: JSON.stringify(attachmentDraft),
      });
      toast.success('Character table state saved.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to save character table state.');
    } finally {
      setSavingAttachment(false);
    }
  };

  const handleAttachCharacter = async (characterId) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/attach`, {
        method: 'POST',
        body: JSON.stringify({ characterId }),
      });
      toast.success('Character attached to campaign.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to attach character.');
    }
  };

  const handleDetachCharacter = async (characterId) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/${characterId}`, { method: 'DELETE' });
      toast.success('Character detached.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to detach character.');
    }
  };

  const handleMembershipChange = async (userId, patch) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast.success('Membership updated.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to update membership.');
    }
  };

  if (!canUseCampaigns) {
    return (
      <div className="cp-page cp-page--guest">
        <div className="cp-guest-hero">
          <div className="cp-guest-emblem">⚔️</div>
          <h1 className="cp-guest-title">Campaign Tabletop</h1>
          <p className="cp-guest-sub">Sign in to open the shared campaign table.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading tabletop…</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="cp-page cp-page--workspace">
        <div className="cp-main__empty">
          <p className="cp-main__empty-icon">🗺️</p>
          <p>Campaign not found.</p>
        </div>
      </div>
    );
  }

  if (campaign.pendingOnly) {
    return (
      <div className="cp-page cp-page--workspace">
        <div className="cpt-pending">
          <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => navigate('/campaign')}>
            ← Back to Campaigns
          </button>
          <h1>{campaign.name}</h1>
          <p>{campaign.description}</p>
          <p>Your request is still waiting for DM approval before you can open the tabletop.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page cp-page--workspace cpt-page">
      {sheetState && (
        <CharacterSheetModal
          character={sheetState.character}
          campaignId={campaign.id}
          canEdit={sheetState.canEdit}
          onClose={() => setSheetState(null)}
          onSaved={async () => {
            setSheetState(null);
            await loadWorkspace();
          }}
        />
      )}

      {editingCampaign && (
        <CampaignSettingsModal
          mode="edit"
          campaign={editingCampaign}
          canDelete={campaign.viewerRole === 'owner' || role === 'admin'}
          onClose={() => setEditingCampaign(null)}
          onSaved={async () => {
            setEditingCampaign(null);
            await loadWorkspace();
          }}
          onDeleted={async () => {
            setEditingCampaign(null);
            navigate('/campaign');
          }}
        />
      )}

      <header className="cpt-header">
        <div className="cpt-header__left">
          <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => navigate('/campaign')}>
            ← Campaigns
          </button>
          <div>
            <p className="cpt-header__eyebrow">Campaign Tabletop</p>
            <h1>{campaign.name}</h1>
            <p>{campaign.description || 'A shared play surface for party cards, quick tools, and live session state.'}</p>
          </div>
        </div>
        <div className="cpt-header__actions">
          <span>{campaign.members?.length || 0} players</span>
          <span>{campaign.attachedCharacters?.length || 0} cards on table</span>
          {canManage && (
            <>
              <button type="button" className={`cp-btn cp-btn--ghost cp-btn--sm ${editMode ? 'cpt-btn--active' : ''}`} onClick={() => setEditMode((prev) => !prev)}>
                {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
              </button>
              <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setEditingCampaign(campaign)}>
                Campaign Settings
              </button>
            </>
          )}
        </div>
      </header>

      <div className="cpt-layout">
        <TableSidebar
          campaign={campaign}
          playerCharacters={playerCharacters}
          attachedIds={attachedIds}
          drawerTab={drawerTab}
          setDrawerTab={setDrawerTab}
          onAttachCharacter={handleAttachCharacter}
          onMembershipChange={handleMembershipChange}
          onOpenSheet={(character, canEdit) => setSheetState({ character, canEdit })}
        />

        <section className="cpt-stage-wrap">
          <div className="cpt-toolbar">
            <div className="cpt-toolbar__rail">
              {(campaign.attachedCharacters || []).map((character) => (
                <button
                  key={character.id}
                  type="button"
                  className={`cpt-rail-card ${String(selectedCharacterId) === String(character.id) ? 'cpt-rail-card--active' : ''}`}
                  onClick={() => setSelectedCharacterId(String(character.id))}
                >
                  <strong>{character.attachment?.nickname || character.name}</strong>
                  <span>HP {character.attachment?.currentHp ?? character.hp}/{character.attachment?.maxHp ?? character.maxHp} · AC {character.ac}</span>
                </button>
              ))}
            </div>
            <div className="cpt-toolbar__actions">
              <button type="button" className="cp-chip-btn" onClick={() => setViewZoom((prev) => clamp(Number((prev - ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}>
                −
              </button>
              <span>{Math.round(viewZoom * 100)}%</span>
              <button type="button" className="cp-chip-btn" onClick={() => setViewZoom((prev) => clamp(Number((prev + ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}>
                +
              </button>
              <button type="button" className="cp-chip-btn" onClick={() => setViewZoom(1)}>
                Reset View
              </button>
              {savingTable && <span className="cpt-saving">Saving layout…</span>}
            </div>
          </div>

          <div
            className="cpt-stage-viewport"
            onDragOver={(event) => {
              if (!canManage || !editMode) return;
              event.preventDefault();
            }}
            onDrop={handleSurfaceDrop}
          >
            <div
              ref={surfaceRef}
              className="cpt-stage"
              style={{
                width: SURFACE_SIZE.width,
                height: SURFACE_SIZE.height,
                transform: `scale(${viewZoom})`,
              }}
              onClick={() => setSpotlightCharacterId(null)}
            >
              {detachedWidgets.map((widget) => (
                <SurfaceWidget
                  key={widget.id}
                  widget={widget}
                  editMode={editMode}
                  canManage={canManage}
                  onDragStart={handleWidgetDragStart}
                  onRemove={handleRemoveWidget}
                />
              ))}

              {(campaign.attachedCharacters || []).map((character) => (
                <CompactCard
                  key={character.id}
                  character={character}
                  cardState={cardsByCharacterId[String(character.id)]}
                  selected={String(selectedCharacterId) === String(character.id)}
                  spotlighted={String(spotlightCharacterId) === String(character.id)}
                  canManage={canManage}
                  editMode={editMode}
                  onSelect={(characterId) => setSelectedCharacterId(String(characterId))}
                  onResize={handleCardResize}
                  onDragStart={handleCardDragStart}
                  onOpenSheet={(nextCharacter, canEdit) => setSheetState({ character: nextCharacter, canEdit })}
                  onWidgetDrop={handleWidgetDropOnCharacter}
                  attachedWidgets={widgetsByCharacterId[String(character.id)] || []}
                />
              ))}
            </div>
          </div>

          <TableShelf canManage={canManage} editMode={editMode} />
        </section>

        <CampaignInspector
          campaign={campaign}
          selectedCharacter={selectedCharacter}
          attachmentDraft={attachmentDraft}
          setAttachmentDraft={setAttachmentDraft}
          canEditAttachment={Boolean(selectedCharacter?.canEditAttachment)}
          savingAttachment={savingAttachment}
          onSaveAttachment={handleSaveAttachment}
          onOpenSheet={(character, canEdit) => setSheetState({ character, canEdit })}
          spotlighted={String(spotlightCharacterId) === String(selectedCharacter?.id)}
          onToggleSpotlight={(characterId) => setSpotlightCharacterId((prev) => (String(prev) === String(characterId) ? null : String(characterId)))}
          onDetachCharacter={handleDetachCharacter}
        />
      </div>
    </div>
  );
}
