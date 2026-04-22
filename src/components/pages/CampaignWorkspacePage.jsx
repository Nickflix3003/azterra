import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import CampaignNotesBoard from './CampaignNotesBoard';
import SceneCanvas from '../scene/SceneCanvas';
import './CampaignPage.css';
import './CampaignWorkspacePage.css';

const ITEM_TYPES = ['gear', 'consumable', 'weapon', 'armor', 'trinket', 'quest'];

function asTagArray(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function compactLine(character) {
  const parts = [character.race, character.class].filter(Boolean);
  if (character.level) parts.push(`Lvl ${character.level}`);
  return parts.join(' / ') || 'Character sheet';
}

function initModifier(character) {
  return character.initiative ?? mod(character.stats?.dex);
}

function CharacterLibraryCard({ character, attached, onAttach, onOpenSheet }) {
  return (
    <article className="cpt-library-card">
      <div>
        <strong>{character.name || 'Unnamed Character'}</strong>
        <span>{compactLine(character)}</span>
      </div>
      <div className="cpt-inline-actions">
        <button type="button" className="cp-chip-btn" onClick={() => onOpenSheet(character, true)}>
          Edit
        </button>
        <button type="button" className="cp-chip-btn" onClick={() => onAttach(character.id)} disabled={attached}>
          {attached ? 'Attached' : 'Add to Campaign'}
        </button>
      </div>
    </article>
  );
}

function AttachedCharacterCard({ character, selected, onSelect, onOpenSheet }) {
  const attachment = character.attachment || {};

  return (
    <article
      className={`cpt-character-card ${selected ? 'cpt-character-card--active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(character.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(character.id);
        }
      }}
    >
      <div className="cpt-character-card__top">
        <div>
          <span className="cpt-card-eyebrow">{character.ownerName}</span>
          <h3>{attachment.nickname || character.name || 'Unnamed Character'}</h3>
          <p>{compactLine(character)}</p>
        </div>
        <button
          type="button"
          className="cp-chip-btn"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSheet(character, character.canEditSheet);
          }}
        >
          {character.canEditSheet ? 'Edit Sheet' : 'View Sheet'}
        </button>
      </div>

      <div className="cpt-stat-row">
        <div>
          <span>HP</span>
          <strong>{attachment.currentHp ?? character.hp}/{attachment.maxHp ?? character.maxHp}</strong>
        </div>
        <div>
          <span>AC</span>
          <strong>{character.ac ?? '-'}</strong>
        </div>
        <div>
          <span>Init</span>
          <strong>{initModifier(character)}</strong>
        </div>
        <div>
          <span>Passive</span>
          <strong>{calculatePassivePerception(character)}</strong>
        </div>
      </div>

      <div className="cpt-character-card__footer">
        <span>{attachment.status || 'active'}</span>
        <span>{character.inventoryItems?.length || 0} campaign items</span>
      </div>
    </article>
  );
}

function ItemComposer({ title, buttonLabel, disabled, onCreate }) {
  const [draft, setDraft] = useState({
    name: '',
    type: 'gear',
    quantity: 1,
    notes: '',
    tags: '',
  });

  const submit = async () => {
    if (!draft.name.trim() || disabled) return;
    await onCreate({
      id: createItemId(),
      name: draft.name.trim(),
      type: draft.type,
      quantity: Math.max(1, Number(draft.quantity) || 1),
      notes: draft.notes.trim(),
      tags: asTagArray(draft.tags),
    });
    setDraft({
      name: '',
      type: 'gear',
      quantity: 1,
      notes: '',
      tags: '',
    });
  };

  return (
    <section className="cpt-composer">
      <div className="cpt-section-head">
        <h4>{title}</h4>
      </div>
      <div className="cpt-form-grid cpt-form-grid--tight">
        <label>
          <span>Name</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Health Potion"
            disabled={disabled}
          />
        </label>
        <label>
          <span>Type</span>
          <select
            value={draft.type}
            onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
            disabled={disabled}
          >
            {ITEM_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Qty</span>
          <input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
            disabled={disabled}
          />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
          placeholder="Short reminder or effect"
          disabled={disabled}
        />
      </label>
      <label>
        <span>Tags</span>
        <input
          value={draft.tags}
          onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
          placeholder="healing, rare, consumable"
          disabled={disabled}
        />
      </label>
      <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={submit} disabled={disabled}>
        {buttonLabel}
      </button>
    </section>
  );
}

function InventoryItemCard({ item, canDelete, moveLabel, onMove, onSave, onDelete }) {
  const [draft, setDraft] = useState({
    name: item.name || '',
    type: item.type || 'gear',
    quantity: item.quantity || 1,
    notes: item.notes || '',
    tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
  });

  useEffect(() => {
    setDraft({
      name: item.name || '',
      type: item.type || 'gear',
      quantity: item.quantity || 1,
      notes: item.notes || '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
    });
  }, [item]);

  const editable = Boolean(item.canManage);

  return (
    <article className="cpt-item-card">
      {editable ? (
        <div className="cpt-item-card__form">
          <div className="cpt-form-grid cpt-form-grid--tight">
            <label>
              <span>Name</span>
              <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label>
              <span>Type</span>
              <select value={draft.type} onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}>
                {ITEM_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Qty</span>
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea rows={2} value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} />
          </label>
          <label>
            <span>Tags</span>
            <input value={draft.tags} onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))} />
          </label>
          <div className="cpt-inline-actions">
            <button
              type="button"
              className="cp-chip-btn"
              onClick={() =>
                onSave(item.id, {
                  name: draft.name.trim(),
                  type: draft.type,
                  quantity: Math.max(1, Number(draft.quantity) || 1),
                  notes: draft.notes.trim(),
                  tags: asTagArray(draft.tags),
                })
              }
            >
              Save
            </button>
            {moveLabel && (
              <button type="button" className="cp-chip-btn" onClick={() => onMove(item.id)}>
                {moveLabel}
              </button>
            )}
            {canDelete && (
              <button type="button" className="cp-chip-btn cp-chip-btn--danger" onClick={() => onDelete(item.id)}>
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="cpt-item-card__readout">
          <div>
            <strong>{item.name}</strong>
            <span>{item.type} / qty {item.quantity}</span>
          </div>
          {item.notes && <p>{item.notes}</p>}
        </div>
      )}
    </article>
  );
}

export default function CampaignWorkspacePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canUseCampaigns = Boolean(user) && ['player', 'editor', 'admin'].includes(role);

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [sheetState, setSheetState] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [savingAttachment, setSavingAttachment] = useState(false);
  const [campaignScene, setCampaignScene] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(true);
  const [sceneSaving, setSceneSaving] = useState(false);
  const [notesBoard, setNotesBoard] = useState(null);
  const [notesBoardLoading, setNotesBoardLoading] = useState(true);
  const [selectedScenePoiId, setSelectedScenePoiId] = useState(null);
  const [attachmentDraft, setAttachmentDraft] = useState({
    nickname: '',
    currentHp: null,
    maxHp: null,
    status: 'active',
    tags: [],
    notes: '',
  });

  const loadWorkspace = useCallback(async () => {
    if (!canUseCampaigns || !id) {
      setCampaign(null);
      setPlayerCharacters([]);
      return;
    }

    const [campaignData, characterData] = await Promise.all([
      apiJson(`/api/campaigns/${id}/table`),
      apiJson('/api/player-characters/me'),
    ]);
    setCampaign(campaignData.campaign || null);
    setNotesBoard(campaignData.campaign?.notesBoardState || null);
    setPlayerCharacters(characterData.characters || []);
  }, [canUseCampaigns, id]);

  const loadScene = useCallback(
    async ({ silent = false } = {}) => {
      if (!canUseCampaigns || !id) {
        setCampaignScene(null);
        setSceneLoading(false);
        return null;
      }

      if (!silent) {
        setSceneLoading(true);
      }

      try {
        const sceneData = await apiJson(`/api/campaigns/${id}/scene`);
        const nextScene = sceneData.sceneState || null;
        setCampaignScene(nextScene);
        return nextScene;
      } catch (error) {
        if (!silent) {
          toast.error(error.message || 'Unable to load the campaign scene.');
        }
        throw error;
      } finally {
        if (!silent) {
          setSceneLoading(false);
        }
      }
    },
    [canUseCampaigns, id, toast]
  );

  const loadNotesBoard = useCallback(
    async ({ silent = false } = {}) => {
      if (!canUseCampaigns || !id) {
        setNotesBoard(null);
        setNotesBoardLoading(false);
        return null;
      }

      if (!silent) {
        setNotesBoardLoading(true);
      }

      try {
        const boardData = await apiJson(`/api/campaigns/${id}/notes-board`);
        const nextBoard = boardData.notesBoardState || null;
        setNotesBoard(nextBoard);
        setCampaign((prev) => (prev ? { ...prev, notesBoardState: nextBoard } : prev));
        return nextBoard;
      } catch (error) {
        if (!silent) {
          toast.error(error.message || 'Unable to load the campaign notes board.');
        }
        throw error;
      } finally {
        if (!silent) {
          setNotesBoardLoading(false);
        }
      }
    },
    [canUseCampaigns, id, toast]
  );

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
          loadScene({ silent: true }),
          loadNotesBoard({ silent: true }),
        ]);
        if (cancelled) return;
        setCampaign(campaignData.campaign || null);
        setNotesBoard(campaignData.campaign?.notesBoardState || null);
        setPlayerCharacters(characterData.characters || []);
        setSceneLoading(false);
        setNotesBoardLoading(false);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'Unable to load campaign workspace.');
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
  }, [canUseCampaigns, id, loadNotesBoard, loadScene, navigate, toast]);

  useEffect(() => {
    if (!canUseCampaigns || !id || campaign?.pendingOnly) return undefined;

    const intervalId = window.setInterval(() => {
      loadScene({ silent: true }).catch(() => {});
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [campaign?.pendingOnly, canUseCampaigns, id, loadScene]);

  useEffect(() => {
    if (!canUseCampaigns || !id || campaign?.pendingOnly) return undefined;

    const intervalId = window.setInterval(() => {
      loadNotesBoard({ silent: true }).catch(() => {});
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [campaign?.pendingOnly, canUseCampaigns, id, loadNotesBoard]);

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
      setAttachmentDraft({
        nickname: '',
        currentHp: null,
        maxHp: null,
        status: 'active',
        tags: [],
        notes: '',
      });
      return;
    }

    setAttachmentDraft({
      nickname: selectedCharacter.attachment?.nickname || '',
      currentHp: selectedCharacter.attachment?.currentHp ?? selectedCharacter.hp ?? null,
      maxHp: selectedCharacter.attachment?.maxHp ?? selectedCharacter.maxHp ?? null,
      status: selectedCharacter.attachment?.status || 'active',
      tags: selectedCharacter.attachment?.tags || [],
      notes: selectedCharacter.attachment?.notes || '',
    });
  }, [selectedCharacter]);

  useEffect(() => {
    const pois = campaignScene?.scene?.pois || [];
    if (pois.length === 0) {
      setSelectedScenePoiId(null);
      return;
    }

    if (!pois.some((poi) => String(poi.id) === String(selectedScenePoiId))) {
      setSelectedScenePoiId(String(pois[0].id));
    }
  }, [campaignScene?.scene?.pois, selectedScenePoiId]);

  const attachedIds = useMemo(
    () => new Set((campaign?.attachedCharacters || []).map((entry) => String(entry.id))),
    [campaign?.attachedCharacters]
  );

  const stashItems = useMemo(
    () => (campaign?.inventory?.items || []).filter((item) => item.ownerType === 'stash'),
    [campaign?.inventory?.items]
  );

  const selectedCharacterItems = useMemo(() => {
    if (!selectedCharacter) return [];
    return (campaign?.inventory?.items || []).filter(
      (item) => item.ownerType === 'character' && String(item.ownerId) === String(selectedCharacter.id)
    );
  }, [campaign?.inventory?.items, selectedCharacter]);

  const canManage = Boolean(campaign?.canManage);
  const canEditBoard = Boolean(campaign?.canEditSession);
  const revealedPoiIds = campaignScene?.revealedPoiIds || [];
  const revealedPoiSet = useMemo(() => new Set(revealedPoiIds.map((poiId) => String(poiId))), [revealedPoiIds]);
  const scenePois = campaignScene?.scene?.pois || [];
  const selectedScenePoi = useMemo(
    () => scenePois.find((poi) => String(poi.id) === String(selectedScenePoiId)) || null,
    [scenePois, selectedScenePoiId]
  );
  const hiddenScenePoiIds = useMemo(() => {
    if (!canManage) return [];
    return scenePois.filter((poi) => !revealedPoiSet.has(String(poi.id))).map((poi) => poi.id);
  }, [canManage, revealedPoiSet, scenePois]);

  const noteAuthors = useMemo(() => {
    const authors = {};
    if (campaign?.ownerId) {
      authors[String(campaign.ownerId)] = campaign.ownerName || 'DM';
    }
    (campaign?.members || []).forEach((member) => {
      if (member?.userId) {
        authors[String(member.userId)] = member.name || member.username || member.email || 'Player';
      }
    });
    if (user?.id) {
      authors[String(user.id)] = user.name || user.username || user.email || 'You';
    }
    return authors;
  }, [campaign?.members, campaign?.ownerId, campaign?.ownerName, user]);

  const refreshWorkspace = useCallback(async () => {
    try {
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to refresh campaign workspace.');
    }
  }, [loadWorkspace, toast]);

  const handleAttachCharacter = async (characterId) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/attach`, {
        method: 'POST',
        body: JSON.stringify({ characterId }),
      });
      toast.success('Character added to campaign.');
      await refreshWorkspace();
      setSelectedCharacterId(String(characterId));
    } catch (error) {
      toast.error(error.message || 'Unable to attach character.');
    }
  };

  const handleScenePatch = async (patch) => {
    if (!campaign?.id || !canManage) return;

    setSceneSaving(true);
    try {
      const response = await apiJson(`/api/campaigns/${campaign.id}/scene`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const nextScene = response.sceneState || null;
      setCampaignScene(nextScene);

      if (Object.prototype.hasOwnProperty.call(patch, 'currentLocationId')) {
        setCampaign((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sessionState: {
              ...(prev.sessionState || {}),
              currentLocationId: patch.currentLocationId || null,
            },
          };
        });
      }
    } catch (error) {
      toast.error(error.message || 'Unable to update DM scene.');
    } finally {
      setSceneSaving(false);
    }
  };

  const handleSceneLocationChange = (locationId) => {
    if (!canManage) return;
    handleScenePatch({ currentLocationId: locationId || null });
  };

  const handleTogglePoiReveal = (poiId) => {
    if (!canManage || !campaignScene?.currentLocationId) return;

    const nextIds = revealedPoiSet.has(String(poiId))
      ? revealedPoiIds.filter((entry) => String(entry) !== String(poiId))
      : [...revealedPoiIds, poiId];

    handleScenePatch({
      locationId: campaignScene.currentLocationId,
      revealedPoiIds: nextIds,
    });
  };

  const handleRevealAllPois = () => {
    if (!canManage || !campaignScene?.currentLocationId) return;
    handleScenePatch({
      locationId: campaignScene.currentLocationId,
      revealedPoiIds: scenePois.map((poi) => poi.id),
    });
  };

  const handleHideAllPois = () => {
    if (!canManage || !campaignScene?.currentLocationId) return;
    handleScenePatch({
      locationId: campaignScene.currentLocationId,
      revealedPoiIds: [],
    });
  };

  const handleDetachCharacter = async (characterId) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/${characterId}`, {
        method: 'DELETE',
      });
      toast.success('Character removed from campaign.');
      await refreshWorkspace();
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
      toast.success('Campaign membership updated.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to update membership.');
    }
  };

  const handleSaveAttachment = async () => {
    if (!selectedCharacter?.canEditAttachment) return;
    setSavingAttachment(true);
    try {
      await apiJson(`/api/campaigns/${campaign.id}/characters/${selectedCharacter.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...attachmentDraft,
          tags: attachmentDraft.tags || [],
        }),
      });
      toast.success('Campaign character state saved.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to save character details.');
    } finally {
      setSavingAttachment(false);
    }
  };

  const handlePersistNotesBoard = useCallback(
    async (nextBoardState) => {
      if (!campaign?.id || !canEditBoard) return nextBoardState;
      const response = await apiJson(`/api/campaigns/${campaign.id}/notes-board`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: nextBoardState?.notes || [],
          strokes: nextBoardState?.strokes || [],
          connectors: nextBoardState?.connectors || [],
        }),
      });
      const nextBoard = response.notesBoardState || nextBoardState;
      setNotesBoard(nextBoard);
      setCampaign((prev) => (prev ? { ...prev, notesBoardState: nextBoard } : prev));
      return nextBoard;
    },
    [campaign?.id, canEditBoard]
  );

  const handleCreateItem = async (item, ownerType, ownerId = null) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/inventory/items`, {
        method: 'POST',
        body: JSON.stringify({
          ...item,
          ownerType,
          ownerId,
        }),
      });
      toast.success('Inventory updated.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to create item.');
    }
  };

  const handleUpdateItem = async (itemId, patch) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/inventory/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast.success('Item saved.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to update item.');
    }
  };

  const handleMoveItem = async (itemId, ownerType, ownerId = null) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/inventory/move`, {
        method: 'POST',
        body: JSON.stringify({ itemId, ownerType, ownerId }),
      });
      toast.success('Item moved.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to move item.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await apiJson(`/api/campaigns/${campaign.id}/inventory/items/${itemId}`, {
        method: 'DELETE',
      });
      toast.success('Item removed.');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error.message || 'Unable to delete item.');
    }
  };

  if (!canUseCampaigns) {
    return (
      <div className="cp-page cp-page--guest">
        <div className="cp-guest-hero">
          <div className="cp-guest-emblem">[]</div>
          <h1 className="cp-guest-title">Campaign Workspace</h1>
          <p className="cp-guest-sub">Sign in to join a campaign, share character sheets, and use the party notes.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading campaign workspace...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="cp-page cp-page--workspace">
        <div className="cp-main__empty">
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
            Back to Campaigns
          </button>
          <h1>{campaign.name}</h1>
          <p>{campaign.description || 'Your request is waiting for DM approval.'}</p>
          <p>You will be able to open the shared character sheets after approval.</p>
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
            await refreshWorkspace();
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
            await refreshWorkspace();
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
            Back to Campaigns
          </button>
          <div>
            <p className="cpt-header__eyebrow">Shared Character Sheets</p>
            <h1>{campaign.name}</h1>
            <p>{campaign.description || 'Keep the party, DM edits, inventory, and shared notes in one place.'}</p>
          </div>
        </div>
        <div className="cpt-header__actions">
          <span>{campaign.members?.length || 0} approved players</span>
          <span>{campaign.attachedCharacters?.length || 0} attached characters</span>
          <span>{campaign.inventory?.items?.length || 0} items in play</span>
          {canManage && (
            <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setEditingCampaign(campaign)}>
              Campaign Settings
            </button>
          )}
        </div>
      </header>

      <div className="cpt-shell">
        <aside className="cpt-sidebar">
          <section className="cpt-panel">
            <div className="cpt-section-head">
              <h3>Party</h3>
              <span>{campaign.members?.length || 0}</span>
            </div>
            <div className="cpt-member-list">
              <div className="cpt-member cpt-member--owner">
                <strong>{campaign.ownerName}</strong>
                <span>Campaign DM</span>
              </div>
              {(campaign.members || []).map((member) => (
                <div key={member.userId} className="cpt-member">
                  <strong>{member.name}</strong>
                  <span>{member.isCoDm ? 'Co-DM' : 'Player'}</span>
                </div>
              ))}
            </div>
          </section>

          {canManage && (
            <section className="cpt-panel">
              <div className="cpt-section-head">
                <h3>Pending Requests</h3>
                <span>{campaign.pendingMembers?.length || 0}</span>
              </div>
              {(campaign.pendingMembers || []).length === 0 ? (
                <p className="cpt-empty">No pending approvals.</p>
              ) : (
                <div className="cpt-member-list">
                  {(campaign.pendingMembers || []).map((member) => (
                    <div key={member.userId} className="cpt-member">
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.email || member.username || 'Pending player'}</span>
                      </div>
                      <div className="cpt-inline-actions">
                        <button
                          type="button"
                          className="cp-chip-btn"
                          onClick={() => handleMembershipChange(member.userId, { status: 'approved', role: member.role || 'player' })}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="cp-chip-btn cp-chip-btn--danger"
                          onClick={() => handleMembershipChange(member.userId, { status: 'rejected', role: 'player' })}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="cpt-panel">
            <div className="cpt-section-head">
              <h3>My Character Library</h3>
              <span>{playerCharacters.length}</span>
            </div>
            <div className="cpt-inline-actions">
              <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setSheetState({ character: null, canEdit: true })}>
                New Character
              </button>
            </div>
            {playerCharacters.length === 0 ? (
              <p className="cpt-empty">Create a character here, then add it to the campaign.</p>
            ) : (
              <div className="cpt-library-list">
                {playerCharacters.map((character) => (
                  <CharacterLibraryCard
                    key={character.id}
                    character={character}
                    attached={attachedIds.has(String(character.id))}
                    onAttach={handleAttachCharacter}
                    onOpenSheet={(nextCharacter, canEdit) => setSheetState({ character: nextCharacter, canEdit })}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="cpt-main">
          <section className="cpt-panel cpt-scene-panel">
            <div className="cpt-section-head">
              <div>
                <p className="cpt-card-eyebrow">DM Scene</p>
                <h3>Live Location Surface</h3>
              </div>
              <div className="cpt-inline-actions">
                {campaignScene?.activeLocation?.name && <span>{campaignScene.activeLocation.name}</span>}
                {canManage && sceneSaving && <span>Updating scene...</span>}
              </div>
            </div>

            {sceneLoading ? (
              <div className="cpt-scene-empty">
                <h4>Loading scene...</h4>
                <p>Pulling the current location image and reveal state for this campaign.</p>
              </div>
            ) : (
              <div className="cpt-scene-layout">
                <div className="cpt-scene-stage">
                  <div className="cpt-scene-toolbar">
                    {canManage ? (
                      <>
                        <label className="cpt-scene-location">
                          <span>Current Location</span>
                          <select
                            value={campaignScene?.currentLocationId || ''}
                            onChange={(event) => handleSceneLocationChange(event.target.value || null)}
                            disabled={sceneSaving}
                          >
                            <option value="">Select a campaign location</option>
                            {(campaignScene?.locationOptions || []).map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="cpt-inline-actions">
                          <button
                            type="button"
                            className="cp-chip-btn"
                            onClick={handleRevealAllPois}
                            disabled={!campaignScene?.currentLocationId || scenePois.length === 0 || sceneSaving}
                          >
                            Reveal All
                          </button>
                          <button
                            type="button"
                            className="cp-chip-btn"
                            onClick={handleHideAllPois}
                            disabled={!campaignScene?.currentLocationId || scenePois.length === 0 || sceneSaving}
                          >
                            Hide All
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="cpt-scene-readout">
                        <strong>{campaignScene?.activeLocation?.name || 'No active scene yet'}</strong>
                        <span>{scenePois.length} revealed point{scenePois.length === 1 ? '' : 's'} of interest</span>
                      </div>
                    )}
                  </div>

                  <SceneCanvas
                    imageUrl={campaignScene?.scene?.imageUrl || ''}
                    pois={scenePois}
                    hiddenPoiIds={hiddenScenePoiIds}
                    selectedPoiId={selectedScenePoiId}
                    showLabels
                    onSelectPoi={(poiId) => setSelectedScenePoiId(poiId)}
                    emptyTitle={campaignScene?.currentLocationId ? 'No scene image prepared' : 'No active scene selected'}
                    emptyText={
                      campaignScene?.currentLocationId
                        ? canManage
                          ? 'Open this location in the map editor and add a scene image before running it live.'
                          : 'The DM has not prepared a scene image for this location yet.'
                        : canManage
                          ? 'Choose a campaign location to start the live scene view.'
                          : 'Wait for the DM to activate a location scene.'
                    }
                  />
                </div>

                <aside className="cpt-scene-sidebar">
                  <div className="cpt-section-head">
                    <h4>{canManage ? 'POI Controls' : 'Visible Points'}</h4>
                    <span>{scenePois.length}</span>
                  </div>

                  {scenePois.length === 0 ? (
                    <div className="cpt-scene-empty cpt-scene-empty--compact">
                      <p>
                        {campaignScene?.currentLocationId
                          ? canManage
                            ? 'No points of interest exist for this scene yet.'
                            : 'Nothing has been revealed in this scene yet.'
                          : 'Select a location to start.'}
                      </p>
                    </div>
                  ) : (
                    <div className="cpt-scene-poi-list">
                      {scenePois.map((poi) => {
                        const isRevealed = revealedPoiSet.has(String(poi.id));
                        return (
                          <article
                            key={poi.id}
                            className={`cpt-scene-poi ${String(selectedScenePoiId) === String(poi.id) ? 'cpt-scene-poi--active' : ''} ${
                              canManage && !isRevealed ? 'cpt-scene-poi--hidden' : ''
                            }`}
                          >
                            <button type="button" className="cpt-scene-poi__main" onClick={() => setSelectedScenePoiId(String(poi.id))}>
                              <span className="cpt-scene-poi__icon">{poi.icon || '?'}</span>
                              <span className="cpt-scene-poi__body">
                                <strong>{poi.name || 'Untitled POI'}</strong>
                                <span>
                                  {canManage
                                    ? isRevealed
                                      ? 'Visible to players'
                                      : 'Hidden from players'
                                    : 'Visible in this scene'}
                                </span>
                              </span>
                            </button>
                            {canManage && (
                              <span className="cpt-scene-poi__action">
                                <button
                                  type="button"
                                  className="cp-chip-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleTogglePoiReveal(poi.id);
                                  }}
                                  disabled={sceneSaving}
                                >
                                  {isRevealed ? 'Hide' : 'Reveal'}
                                </button>
                              </span>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {selectedScenePoi && (
                    <section className="cpt-scene-notes">
                      <div className="cpt-section-head">
                        <h4>{selectedScenePoi.name || 'Selected POI'}</h4>
                        <span>{selectedScenePoi.icon || '?'}</span>
                      </div>
                      {canManage ? (
                        <p>{selectedScenePoi.dmNotes || 'No DM notes for this point yet.'}</p>
                      ) : (
                        <p>This marker is currently visible to the party.</p>
                      )}
                    </section>
                  )}
                </aside>
              </div>
            )}
          </section>

          <CampaignNotesBoard
            boardState={notesBoard}
            canEdit={canEditBoard}
            canManage={canManage}
            currentUser={user}
            authorNames={noteAuthors}
            loading={notesBoardLoading}
            onPersist={handlePersistNotesBoard}
          />

          <div className="cpt-main-grid">
            <section className="cpt-panel">
              <div className="cpt-section-head">
                <div>
                  <p className="cpt-card-eyebrow">Attached Sheets</p>
                  <h3>Party Characters</h3>
                </div>
                <span>{campaign.attachedCharacters?.length || 0}</span>
              </div>

              {(campaign.attachedCharacters || []).length === 0 ? (
                <div className="cpt-empty-state">
                  <h4>No characters attached yet</h4>
                  <p>Players should add one of their saved character sheets from the library on the left.</p>
                </div>
              ) : (
                <div className="cpt-character-grid">
                  {(campaign.attachedCharacters || []).map((character) => (
                    <AttachedCharacterCard
                      key={character.id}
                      character={character}
                      selected={String(selectedCharacterId) === String(character.id)}
                      onSelect={setSelectedCharacterId}
                      onOpenSheet={(nextCharacter, canEdit) => setSheetState({ character: nextCharacter, canEdit })}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="cpt-panel cpt-detail-panel">
              {!selectedCharacter ? (
                <div className="cpt-empty-state">
                  <h4>Select a character</h4>
                  <p>Pick an attached character to edit campaign stats, inventory, and notes.</p>
                </div>
              ) : (
                <>
                  <div className="cpt-detail-hero">
                    <div>
                      <p className="cpt-card-eyebrow">{selectedCharacter.ownerName}</p>
                      <h3>{selectedCharacter.attachment?.nickname || selectedCharacter.name}</h3>
                      <p>{compactLine(selectedCharacter)}</p>
                    </div>
                    <div className="cpt-inline-actions">
                      <button
                        type="button"
                        className="cp-chip-btn"
                        onClick={() => setSheetState({ character: selectedCharacter, canEdit: selectedCharacter.canEditSheet })}
                      >
                        {selectedCharacter.canEditSheet ? 'Edit Full Sheet' : 'View Full Sheet'}
                      </button>
                      {selectedCharacter.canEditAttachment && (
                        <button
                          type="button"
                          className="cp-chip-btn cp-chip-btn--danger"
                          onClick={() => handleDetachCharacter(selectedCharacter.id)}
                        >
                          Remove from Campaign
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="cpt-stat-row cpt-stat-row--detail">
                    <div>
                      <span>HP</span>
                      <strong>{attachmentDraft.currentHp ?? selectedCharacter.hp}/{attachmentDraft.maxHp ?? selectedCharacter.maxHp}</strong>
                    </div>
                    <div>
                      <span>AC</span>
                      <strong>{selectedCharacter.ac ?? '-'}</strong>
                    </div>
                    <div>
                      <span>Speed</span>
                      <strong>{selectedCharacter.speed ?? '-'}</strong>
                    </div>
                    <div>
                      <span>Init</span>
                      <strong>{initModifier(selectedCharacter)}</strong>
                    </div>
                    <div>
                      <span>Passive</span>
                      <strong>{calculatePassivePerception(selectedCharacter)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{attachmentDraft.status || 'active'}</strong>
                    </div>
                  </div>

                  <section className="cpt-section">
                    <div className="cpt-section-head">
                      <h4>Campaign Character Details</h4>
                      {selectedCharacter.canEditAttachment && (
                        <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={handleSaveAttachment} disabled={savingAttachment}>
                          {savingAttachment ? 'Saving...' : 'Save Character State'}
                        </button>
                      )}
                    </div>

                    {selectedCharacter.canEditAttachment ? (
                      <>
                        <div className="cpt-form-grid">
                          <label>
                            <span>Display Name</span>
                            <input
                              value={attachmentDraft.nickname || ''}
                              onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, nickname: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Status</span>
                            <input
                              value={attachmentDraft.status || 'active'}
                              onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, status: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="cpt-form-grid">
                          <label>
                            <span>Current HP</span>
                            <input
                              type="number"
                              value={attachmentDraft.currentHp ?? ''}
                              onChange={(event) =>
                                setAttachmentDraft((prev) => ({
                                  ...prev,
                                  currentHp: event.target.value === '' ? null : Number(event.target.value),
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>Max HP</span>
                            <input
                              type="number"
                              value={attachmentDraft.maxHp ?? ''}
                              onChange={(event) =>
                                setAttachmentDraft((prev) => ({
                                  ...prev,
                                  maxHp: event.target.value === '' ? null : Number(event.target.value),
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>Condition Tags</span>
                          <input
                            value={(attachmentDraft.tags || []).join(', ')}
                            onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, tags: asTagArray(event.target.value) }))}
                            placeholder="Blessed, Exhausted, Concentrating"
                          />
                        </label>
                        <label>
                          <span>Campaign Notes</span>
                          <textarea
                            rows={4}
                            value={attachmentDraft.notes || ''}
                            onChange={(event) => setAttachmentDraft((prev) => ({ ...prev, notes: event.target.value }))}
                          />
                        </label>
                      </>
                    ) : (
                      <div className="cpt-readout">
                        <p>{selectedCharacter.attachment?.notes || 'No campaign-specific notes on this character yet.'}</p>
                        {(selectedCharacter.attachment?.tags || []).length > 0 && (
                          <div className="cpt-tag-row">
                            {(selectedCharacter.attachment?.tags || []).map((tag) => (
                              <span key={tag} className="cpt-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="cpt-section">
                    <div className="cpt-section-head">
                      <h4>{selectedCharacter.name}'s Inventory</h4>
                      <span>{selectedCharacterItems.length}</span>
                    </div>
                    {canManage && (
                      <ItemComposer
                        title="Give an Item"
                        buttonLabel="Add to Character"
                        disabled={!selectedCharacter}
                        onCreate={(item) => handleCreateItem(item, 'character', selectedCharacter.id)}
                      />
                    )}
                    {selectedCharacterItems.length === 0 ? (
                      <p className="cpt-empty">No campaign items assigned to this character.</p>
                    ) : (
                      <div className="cpt-item-list">
                        {selectedCharacterItems.map((item) => (
                          <InventoryItemCard
                            key={item.id}
                            item={item}
                            canDelete={campaign.canManage}
                            moveLabel={item.canManage ? 'Move to Party Stash' : null}
                            onMove={(itemId) => handleMoveItem(itemId, 'stash')}
                            onSave={handleUpdateItem}
                            onDelete={handleDeleteItem}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="cpt-section">
                    <div className="cpt-section-head">
                      <h4>Party Stash</h4>
                      <span>{stashItems.length}</span>
                    </div>
                    {canManage && (
                      <ItemComposer
                        title="Create Stash Item"
                        buttonLabel="Add to Stash"
                        onCreate={(item) => handleCreateItem(item, 'stash', null)}
                      />
                    )}
                    {stashItems.length === 0 ? (
                      <p className="cpt-empty">No shared stash items yet.</p>
                    ) : (
                      <div className="cpt-item-list">
                        {stashItems.map((item) => (
                          <InventoryItemCard
                            key={item.id}
                            item={item}
                            canDelete={campaign.canManage}
                            moveLabel={selectedCharacter && item.canManage ? `Give to ${selectedCharacter.attachment?.nickname || selectedCharacter.name}` : null}
                            onMove={(itemId) => handleMoveItem(itemId, 'character', selectedCharacter.id)}
                            onSave={handleUpdateItem}
                            onDelete={handleDeleteItem}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
