import React, { useEffect, useMemo, useState } from 'react';
import characters from '../../data/characters_heroes';
import npcsData from '../../data/npcs';
import locationsData from '../../data/locations.json';
import { useAuth } from '../../context/AuthContext';
import { useContent } from '../../context/ContentContext';
import { canView as canViewHelper } from '../../utils/permissions';
import '../UI/PageUI.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TABS = ['npcs', 'players'];
const CAMPAIGNS = ['All', 'Main', 'Side'];
const SECRET_OPTIONS = [
  { id: 'aurora-ember', label: 'Aurora Ember' },
  { id: 'silent-archive', label: 'Silent Archive' },
  { id: 'gilded-horizon', label: 'Gilded Horizon' },
  { id: 'amber-archive', label: 'Amber Archive' },
  { id: 'shadow-court', label: 'Shadow Court' },
];
const ALL_SECRET_IDS = SECRET_OPTIONS.map((s) => s.id);
const CARD_THEMES = [
  {
    id: 'sunset',
    label: 'Sunset Mirage',
    background: 'linear-gradient(135deg, rgba(247, 146, 86, 0.85), rgba(23, 14, 9, 0.95))',
    foreground: '#ffe5ba',
    accent: '#f79256',
  },
  {
    id: 'aurora',
    label: 'Aurora Veil',
    background: 'linear-gradient(135deg, rgba(67, 206, 162, 0.8), rgba(24, 90, 157, 0.95))',
    foreground: '#e7f5ff',
    accent: '#43cea2',
  },
  {
    id: 'nightfall',
    label: 'Nightfall Alloy',
    background: 'linear-gradient(135deg, rgba(41, 31, 53, 0.95), rgba(13, 13, 20, 0.95))',
    foreground: '#f6d7ff',
    accent: '#b084f7',
  },
  {
    id: 'oasis',
    label: 'Oasis Bloom',
    background: 'linear-gradient(135deg, rgba(47, 72, 88, 0.92), rgba(24, 112, 105, 0.92))',
    foreground: '#d6ffea',
    accent: '#57c5b6',
  },
  {
    id: 'emberstorm',
    label: 'Ember Storm',
    background: 'linear-gradient(145deg, rgba(191, 45, 28, 0.9), rgba(49, 4, 14, 0.95))',
    foreground: '#ffe3d4',
    accent: '#ff7b54',
  },
  {
    id: 'luminant',
    label: 'Luminant Frost',
    background: 'linear-gradient(135deg, rgba(62, 70, 132, 0.9), rgba(31, 43, 72, 0.95))',
    foreground: '#e4f3ff',
    accent: '#9dbbff',
  },
  {
    id: 'verdant',
    label: 'Verdant Canopy',
    background: 'linear-gradient(135deg, rgba(34, 68, 56, 0.9), rgba(12, 31, 23, 0.95))',
    foreground: '#d9ffe0',
    accent: '#6fcf97',
  },
  {
    id: 'solstice',
    label: 'Solstice Crown',
    background: 'linear-gradient(135deg, rgba(232, 182, 56, 0.9), rgba(118, 67, 0, 0.95))',
    foreground: '#fff5d6',
    accent: '#f5c451',
  },
  {
    id: 'tidal',
    label: 'Tidal Horizon',
    background: 'linear-gradient(135deg, rgba(19, 78, 112, 0.9), rgba(3, 30, 53, 0.95))',
    foreground: '#d6f1ff',
    accent: '#4cc9f0',
  },
  {
    id: 'amethyst',
    label: 'Amethyst Shroud',
    background: 'linear-gradient(135deg, rgba(126, 67, 170, 0.9), rgba(35, 13, 53, 0.95))',
    foreground: '#f5e0ff',
    accent: '#d295ff',
  },
  {
    id: 'foundry',
    label: 'Iron Foundry',
    background: 'linear-gradient(135deg, rgba(67, 70, 75, 0.92), rgba(20, 20, 24, 0.95))',
    foreground: '#f2f2f2',
    accent: '#f2a365',
  },
  {
    id: 'crimsonwood',
    label: 'Crimson Wood',
    background: 'linear-gradient(135deg, rgba(120, 28, 44, 0.92), rgba(45, 10, 18, 0.95))',
    foreground: '#ffdada',
    accent: '#ff5e78',
  },
  {
    id: 'auric',
    label: 'Auric Temple',
    background: 'linear-gradient(135deg, rgba(191, 161, 96, 0.9), rgba(42, 34, 18, 0.95))',
    foreground: '#fff6db',
    accent: '#f0d290',
  },
  {
    id: 'cobalt',
    label: 'Cobalt Drift',
    background: 'linear-gradient(135deg, rgba(25, 53, 97, 0.9), rgba(10, 17, 30, 0.95))',
    foreground: '#d7e8ff',
    accent: '#5c7cfa',
  },
  {
    id: 'dawnlight',
    label: 'Dawnlight',
    background: 'linear-gradient(135deg, rgba(255, 182, 133, 0.9), rgba(237, 118, 84, 0.95))',
    foreground: '#fff6ec',
    accent: '#ff9f68',
  },
  {
    id: 'selenic',
    label: 'Selenic Veil',
    background: 'linear-gradient(135deg, rgba(32, 28, 61, 0.9), rgba(5, 5, 12, 0.95))',
    foreground: '#e0e0ff',
    accent: '#a5a6f6',
  },
  {
    id: 'mistwood',
    label: 'Mistwood Trail',
    background: 'linear-gradient(135deg, rgba(56, 74, 60, 0.9), rgba(24, 33, 28, 0.95))',
    foreground: '#eaf8ef',
    accent: '#9ad1b4',
  },
  {
    id: 'emberglow',
    label: 'Emberglow Grove',
    background: 'linear-gradient(135deg, rgba(208, 84, 48, 0.9), rgba(109, 29, 20, 0.95))',
    foreground: '#ffe8d9',
    accent: '#ffab76',
  },
];

function PeoplePage() {
  const { role, user } = useAuth();
  const { portraitConfig, portraitStatus, refreshPortraitStatus, generatePortrait } = useContent();
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState('npcs');
  const [campaign, setCampaign] = useState('All');
  const [adminView, setAdminView] = useState(false);
  const [visibleIds, setVisibleIds] = useState([]);
  const [npcVisibility, setNpcVisibility] = useState([]);
  const [locVisibility, setLocVisibility] = useState([]);
  const [npcItems, setNpcItems] = useState([]);
  const [locItems, setLocItems] = useState([]);
  const [npcTruesight, setNpcTruesight] = useState([]);
  const [locTruesight, setLocTruesight] = useState([]);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [favPending, setFavPending] = useState(false);
  const [pendingNpcEdits, setPendingNpcEdits] = useState({});
  const [pendingLocEdits, setPendingLocEdits] = useState({});
  const [pendingPlayerEdits, setPendingPlayerEdits] = useState({});
  const [savingNpcId, setSavingNpcId] = useState(null);
  const [savingLocId, setSavingLocId] = useState(null);
  const [savingPlayerId, setSavingPlayerId] = useState(null);
  const [viewFavorites, setViewFavorites] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [previewSecrets, setPreviewSecrets] = useState([]);
  const [cardOrder, setCardOrder] = useState({ locations: [], npcs: [], players: [] });
  const [draggingCard, setDraggingCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [editorTab, setEditorTab] = useState('details');
  const [portraitPending, setPortraitPending] = useState({});
  const [playerMeta, setPlayerMeta] = useState({});

  useEffect(() => {
    const load = async () => {
      setError('');
      try {
        const visRes = await fetch(`${API_BASE_URL}/view/characters`, { credentials: 'include' });
        const visData = await visRes.json();
        if (visRes.ok) {
          setVisibleIds(visData.visibleIds || []);
        }
        const npcRes = await fetch(`${API_BASE_URL}/view/npcs`, { credentials: 'include' });
        const npcData = await npcRes.json();
        if (npcRes.ok) {
          const allNpc = npcData.items || [];
          const visibleNpcIds = allNpc.filter((n) => n.visible !== false).map((n) => n.id);
          setNpcVisibility(visibleNpcIds);
          setNpcItems(allNpc);
          setNpcTruesight(npcData.truesightIds || []);
        }
        const locRes = await fetch(`${API_BASE_URL}/view/locations`, { credentials: 'include' });
        const locData = await locRes.json();
        if (locRes.ok) {
          const allLoc = locData.items || [];
          const visibleLocIds = allLoc.filter((l) => l.visible !== false).map((l) => l.id);
          setLocVisibility(visibleLocIds);
          setLocItems(allLoc);
          setLocTruesight(locData.truesightIds || []);
        }

        if (user) {
          const favRes = await fetch(`${API_BASE_URL}/view/favorites`, { credentials: 'include' });
          const favData = await favRes.json();
          if (favRes.ok) setViewFavorites(favData.viewFavorites || []);

          const playerRes = await fetch(`${API_BASE_URL}/view/players`, { credentials: 'include' });
          const playerData = await playerRes.json();
          if (playerRes.ok) setPlayers(playerData.users || []);

          if (isAdmin) {
            const playerMetaRes = await fetch(`${API_BASE_URL}/entities/players`, {
              credentials: 'include',
            });
            if (playerMetaRes.ok) {
              const metaJson = await playerMetaRes.json();
              const map = {};
              (metaJson.items || []).forEach((item) => {
                map[item.id] = item;
              });
              setPlayerMeta(map);
            }
          }
        }
      } catch (err) {
        setError(err.message || 'Unable to load view data.');
      }
    };
    load();
  }, [user, isAdmin]);

  useEffect(() => {
    setAdminView(isAdmin);
  }, [isAdmin]);


  const passesVisibility = (entity, viewer) => {
    if (entity.truesight) return true;
    if (!entity.visible) return false;
    // Visible is true; now require secret to be unlocked if present
    return canViewHelper(viewer, {
      roles: ['guest', 'editor', 'admin', 'pending', 'player'],
      secretId: entity.secretId,
    });
  };

  const currentList = useMemo(() => {
    const campaignFilter = (itemCampaign = 'Main') =>
      campaign === 'All' || (itemCampaign || 'Main') === campaign;
    const isPreviewingUser = isAdmin && !adminView;
    const viewer = {
      role: adminView && isAdmin ? 'admin' : role,
      unlockedSecrets: isPreviewingUser
        ? previewSecrets
        : Array.isArray(user?.unlockedSecrets)
        ? user.unlockedSecrets
        : [],
    };
    if (tab === 'npcs') {
      const source = npcItems.length ? npcItems : npcsData;
      const base = source.map((n) => ({
        ...n,
        visible: n.visible !== false,
        truesight: npcTruesight.includes(n.id),
        campaign: n.campaign || 'Main',
      }));
      const filtered =
        adminView && isAdmin ? base : base.filter((n) => passesVisibility(n, viewer));
      return filtered.filter((n) => campaignFilter(n.campaign));
    }
    if (tab === 'players') {
      const base =
        players.length && adminView && isAdmin
          ? players
          : players.length
          ? players.filter((p) => campaignFilter(p.campaign))
          : characters
              .filter((c) => (adminView && isAdmin) || visibleIds.includes(c.id))
              .map((c) => ({ id: c.id, name: c.name, character: c, campaign: c.campaign || 'Main' }))
              .filter((p) => campaignFilter(p.campaign));
      const filtered =
        adminView && isAdmin
          ? base
          : base.filter((p) =>
              canViewHelper(viewer, {
                roles: ['guest', 'editor', 'admin', 'pending', 'player'],
                secretId: p.secretId,
              })
            );
      return filtered;
    }
    return [];
  }, [tab, players, visibleIds, npcItems, isAdmin, campaign, adminView, role, npcTruesight, previewSecrets, user]);

  useEffect(() => {
    if (tab !== 'players') return;
    const ids = new Set();
    currentList.forEach((item) => {
      const character =
        item.character || characters.find((c) => c.id === item.featuredCharacter) || characters.find((c) => c.id === item.id);
      if (character?.id) ids.add(character.id);
    });
    ids.forEach((id) => refreshPortraitStatus(id));
  }, [tab, currentList, refreshPortraitStatus]);

  useEffect(() => {
    setCardOrder((prev) => {
      const ids = currentList.map((item) => `${tab}-${item.id}`);
      const existing = (prev[tab] || []).filter((id) => ids.includes(id));
      const nextOrder = [...existing, ...ids.filter((id) => !existing.includes(id))];
      const prevOrder = prev[tab] || [];
      const isSame = nextOrder.length === prevOrder.length && nextOrder.every((id, idx) => id === prevOrder[idx]);
      if (isSame) return prev;
      return { ...prev, [tab]: nextOrder };
    });
  }, [currentList, tab]);

  useEffect(() => {
    if (!adminView) {
      setEditingCard(null);
    }
  }, [adminView]);

  useEffect(() => {
    if (!editingCard) return;
    const list =
      editingCard.type === 'locations'
        ? locItems
        : editingCard.type === 'npcs'
        ? npcItems
        : players;
    const exists = list.some((entry) => String(entry.id) === String(editingCard.id));
    if (!exists) {
      setEditingCard(null);
    }
  }, [editingCard, locItems, npcItems, players]);

  const orderedList = useMemo(() => {
    const order = cardOrder[tab] || [];
    const map = new Map(currentList.map((item) => [`${tab}-${item.id}`, item]));
    const arranged = order.map((key) => map.get(key)).filter(Boolean);
    const extras = currentList.filter((item) => !order.includes(`${tab}-${item.id}`));
    return [...arranged, ...extras];
  }, [cardOrder, currentList, tab]);


  const toggleVisible = async (id, type) => {
    if (!isAdmin || !user) return;
    const endpoint = type === 'npc' ? 'npcs/visible' : 'locations/visible';
    const state = type === 'npc' ? new Set(npcVisibility) : new Set(locVisibility);
    if (state.has(id)) state.delete(id);
    else state.add(id);
    const payload = { visibleIds: Array.from(state) };
    try {
      await fetch(`${API_BASE_URL}/view/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (type === 'npc') {
        setNpcVisibility(payload.visibleIds);
        setNpcItems((prev) => prev.map((n) => (n.id === id ? { ...n, visible: payload.visibleIds.includes(id) } : n)));
      } else {
        setLocVisibility(payload.visibleIds);
        setLocItems((prev) => prev.map((l) => (l.id === id ? { ...l, visible: payload.visibleIds.includes(id) } : l)));
      }
    } catch (err) {
      setError(err.message || 'Unable to update visibility.');
    }
  };

  const toggleTruesight = async (id, type) => {
    if (!isAdmin || !user) return;
    const endpoint = type === 'npc' ? 'npcs/truesight' : 'locations/truesight';
    const state = type === 'npc' ? new Set(npcTruesight) : new Set(locTruesight);
    if (state.has(id)) state.delete(id);
    else state.add(id);
    const payload = { truesightIds: Array.from(state) };
    try {
      await fetch(`${API_BASE_URL}/view/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (type === 'npc') {
        setNpcTruesight(payload.truesightIds);
        setNpcItems((prev) => prev.map((n) => (n.id === id ? { ...n, truesight: payload.truesightIds.includes(id) } : n)));
      } else {
        setLocTruesight(payload.truesightIds);
        setLocItems((prev) => prev.map((l) => (l.id === id ? { ...l, truesight: payload.truesightIds.includes(id) } : l)));
      }
    } catch (err) {
      setError(err.message || 'Unable to update truesight.');
    }
  };

  const setNpcDraft = (id, field, value) => {
    setPendingNpcEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const setLocDraft = (id, field, value) => {
    setPendingLocEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const handleLocationImageFile = (locationId, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (png, jpg, webp).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLocDraft(locationId, 'heroImage', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLocationImageDrop = (event, locationId) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    handleLocationImageFile(locationId, file);
  };

  const handleLocationImageBrowse = (event, locationId) => {
    const file = event.target.files?.[0];
    handleLocationImageFile(locationId, file);
    event.target.value = '';
  };

  const handleDragStart = (event, tabName, key) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
    setDraggingCard(key);
  };

  const handleDragOver = (event, tabName, key) => {
    event.preventDefault();
    if (!draggingCard || draggingCard === key) return;
    setCardOrder((prev) => {
      const order = [...(prev[tabName] || [])];
      const fromIdx = order.indexOf(draggingCard);
      const toIdx = order.indexOf(key);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, draggingCard);
      return { ...prev, [tabName]: order };
    });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDraggingCard(null);
  };

  const handleDragEnd = () => {
    setDraggingCard(null);
  };

  const handlePortraitGenerate = async (characterId) => {
    if (!characterId || !isAdmin || !user) return;
    setPortraitPending((prev) => ({ ...prev, [characterId]: true }));
    setError('');
    try {
      const result = await generatePortrait(characterId);
      if (result.error) {
        throw new Error(result.error);
      }
      await refreshPortraitStatus(characterId);
    } catch (err) {
      setError(err.message || 'Unable to generate portrait.');
    } finally {
      setPortraitPending((prev) => {
        const copy = { ...prev };
        delete copy[characterId];
        return copy;
      });
    }
  };

  const openEditor = (itemType, itemId) => {
    if (!adminView || !isAdmin) return;
    setEditingCard({ type: itemType, id: itemId });
    setEditorTab('details');
  };

  const closeEditor = () => {
    if (editingCard) {
      setExpanded((prev) => {
        const copy = { ...prev };
        delete copy[`${editingCard.type}-${editingCard.id}`];
        return copy;
      });
    }
    setEditingCard(null);
  };

  const mergedNpc = (item) => ({
    ...item,
    ...(pendingNpcEdits[item.id] || {}),
  });

  const mergedLoc = (item) => ({
    ...item,
    ...(pendingLocEdits[item.id] || {}),
  });

  const mergedPlayerMeta = (item) => ({
    ...item,
    ...(playerMeta[item.id] || {}),
    ...(pendingPlayerEdits[item.id] || {}),
  });

  const saveNpc = async (id) => {
    if (!isAdmin || !user) return;
    const original = npcItems.find((n) => n.id === id);
    if (!original) return;
    const draft = mergedNpc(original);
    setSavingNpcId(id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/entities/npcs/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...draft,
          id: draft.id,
          locationId: draft.locationId || null,
          campaign: draft.campaign || 'Main',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save NPC.');
      }
      const nextItems = Array.isArray(data.items) ? data.items : [data.item].filter(Boolean);
      setNpcItems(
        nextItems.map((entry) => ({
          ...entry,
          visible: npcVisibility.includes(entry.id),
          truesight: npcTruesight.includes(entry.id),
        }))
      );
      setPendingNpcEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      setError(err.message || 'Unable to save NPC.');
    } finally {
      setSavingNpcId(null);
    }
  };

  const saveLocation = async (id) => {
    if (!isAdmin || !user) return;
    const sanitizeLocation = (loc) => {
      const { visible: _visible, truesight: _truesight, ...rest } = loc;
      return {
        ...rest,
        campaign: loc.campaign || 'Main',
        regionId: loc.regionId ?? null,
        markerId: loc.markerId ?? null,
      };
    };
    const merged = locItems.map((loc) =>
      loc.id === id ? sanitizeLocation(mergedLoc(loc)) : sanitizeLocation(loc)
    );
    setSavingLocId(id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/locations/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ locations: merged }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save location.');
      }
      const saved = Array.isArray(data.locations) ? data.locations : [];
      setLocItems(
        saved.map((loc) => ({
          ...loc,
          visible: locVisibility.includes(loc.id),
          truesight: locTruesight.includes(loc.id),
        }))
      );
      setPendingLocEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      setError(err.message || 'Unable to save location.');
    } finally {
      setSavingLocId(null);
    }
  };

  const savePlayerMeta = async (player) => {
    if (!isAdmin || !user || !player) return;
    const merged = mergedPlayerMeta(player);
    setSavingPlayerId(player.id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/entities/players/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...merged,
          id: player.id,
          name: merged.name || player.name,
          description: merged.description || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save player metadata.');
      }
      const nextItems = Array.isArray(data.items) ? data.items : [data.item].filter(Boolean);
      const map = {};
      nextItems.forEach((entry) => {
        map[entry.id] = entry;
      });
      setPlayerMeta(map);
      setPendingPlayerEdits((prev) => {
        const copy = { ...prev };
        delete copy[player.id];
        return copy;
      });
    } catch (err) {
      setError(err.message || 'Unable to save player metadata.');
    } finally {
      setSavingPlayerId(null);
    }
  };

  const toggleFavorite = async (itemId) => {
    if (!user) return;
    setFavPending(true);
    try {
      const type =
        tab === 'players' ? 'character' : tab === 'npcs' ? 'npc' : 'location';
      await fetch(`${API_BASE_URL}/view/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ type, id: itemId, favorite: !viewFavorites.includes(`${type}:${itemId}`) }),
      });
      const favRes = await fetch(`${API_BASE_URL}/view/favorites`, { credentials: 'include' });
      const favData = await favRes.json();
      if (favRes.ok) setViewFavorites(favData.viewFavorites || []);
    } catch {
      /* ignore */
    } finally {
      setFavPending(false);
    }
  };

  const renderCard = (item) => {
    const cardKey = `${tab}-${item.id}`;
    const isExpanded = Boolean(expanded[cardKey]);
    const isDragging = draggingCard === cardKey;
    const toggleExpanded = () => {
      const nextExpanded = !isExpanded;
      setExpanded((prev) => ({
        ...prev,
        [cardKey]: nextExpanded,
      }));
      if (adminView && isAdmin) {
        if (nextExpanded) {
          openEditor(tab, item.id);
        } else if (editingCard && editingCard.type === tab && String(editingCard.id) === String(item.id)) {
          closeEditor();
        }
      }
    };
    const dragProps = {
      draggable: true,
      onDragStart: (event) => handleDragStart(event, tab, cardKey),
      onDragOver: (event) => handleDragOver(event, tab, cardKey),
      onDragEnd: handleDragEnd,
      onDrop: handleDrop,
    };

    if (tab === 'players') {
      const character = item.character || characters.find((c) => c.id === item.featuredCharacter) || characters.find((c) => c.id === item.id);
      const merged = mergedPlayerMeta(item);
      const visibleChars = characters.filter((c) => (adminView && isAdmin) || visibleIds.includes(c.id));
      const portraitInfo = character ? portraitStatus[character.id] : null;
      const portraitUrl = portraitInfo?.url;
      const canGeneratePortrait =
        isAdmin && adminView && character && (character.imageDescription || item.imageDescription);
      const portraitDisabled = portraitConfig.checked && !portraitConfig.enabled;
      return (
        <div
          className={`view-card ${isExpanded ? 'view-card--expanded' : ''} ${isDragging ? 'view-card--dragging' : ''}`}
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          {...dragProps}
        >
          <div className="view-card__header">
            <div>
              <p className="account-card__eyebrow">{item.username ? `@${item.username}` : 'Player'}</p>
              <h3>{item.name || character?.name}</h3>
            </div>
            {character && (
              <button
                type="button"
                className={`fav-btn ${viewFavorites.includes(`character:${character.id}`) ? 'fav-btn--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(character.id);
                }}
                disabled={favPending}
              >
                {viewFavorites.includes(`character:${character.id}`) ? '★' : '☆'}
              </button>
            )}
          </div>
          {character && (
            <div className="view-card__body">
              {portraitUrl ? (
                <div className="view-card__media" style={{ maxHeight: 220 }}>
                  <img src={portraitUrl} alt={`${character.name} portrait`} />
                </div>
              ) : (
                <p className="account-muted">No portrait yet.</p>
              )}
              <p className="account-muted">
                {character.class} · {character.race}
              </p>
              {isAdmin && adminView ? (
                <label className="admin-field">
                  <span>Description</span>
                  <textarea
                    value={merged.description || ''}
                    rows={3}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setPendingPlayerEdits((prev) => ({
                        ...prev,
                        [item.id]: { ...(prev[item.id] || {}), description: e.target.value },
                      }))
                    }
                  />
                </label>
              ) : (
                merged.description && <p className="account-muted">{merged.description}</p>
              )}
            </div>
          )}
          {isExpanded && (
            <div className="view-card__body">
              <p className="account-muted">Visible Characters</p>
              <div className="mini-list">
                {visibleChars.length ? visibleChars.map((c) => <span key={c.id}>{c.name}</span>) : <span>No characters visible.</span>}
              </div>
              {character && canGeneratePortrait && (
                <div className="view-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="admin-toggle-btn"
                    disabled={portraitDisabled || portraitPending[character.id]}
                    title={portraitDisabled ? 'Image generation unavailable (missing API key)' : ''}
                    onClick={() => handlePortraitGenerate(character.id)}
                  >
                    {portraitPending[character.id]
                      ? 'Generating...'
                      : portraitInfo?.exists
                      ? 'Regenerate Portrait'
                      : 'Generate Portrait'}
                  </button>
                  {portraitDisabled && (
                    <p className="account-muted">Portrait generation disabled (no key).</p>
                  )}
                </div>
              )}
              {isAdmin && adminView && (
                <div className="view-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="admin-toggle-btn"
                    disabled={savingPlayerId === item.id}
                    onClick={() => savePlayerMeta(item)}
                  >
                    {savingPlayerId === item.id ? 'Saving...' : 'Save Description'}
                  </button>
                </div>
              )}
              {isAdmin && adminView && item.secretId && (
                <div className="secret-meta">
                  <p className="account-muted">Requires secret: {item.secretId}</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    if (tab === 'npcs') {
      const npcDraft = mergedNpc(item);
      const locationOptions = (locItems.length ? locItems : locationsData.locations || []).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      return (
        <div
          className={`view-card ${isExpanded ? 'view-card--expanded' : ''} ${isDragging ? 'view-card--dragging' : ''}`}
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          {...dragProps}
        >
          <div className="view-card__header">
            <div>
              <p className="account-card__eyebrow">{item.type}</p>
              <h3>{item.name}</h3>
            </div>
            <div className="view-card__actions">
              {user && (
                <button
                  type="button"
                  className={`fav-btn ${viewFavorites.includes(`npc:${item.id}`) ? 'fav-btn--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(item.id);
                  }}
                  disabled={favPending}
                >
                  {viewFavorites.includes(`npc:${item.id}`) ? '★' : '☆'}
                </button>
              )}
            </div>
          </div>
          {isAdmin && adminView ? (
            <label className="admin-field" onClick={(e) => e.stopPropagation()}>
              <span>Description</span>
              <textarea
                value={npcDraft.blurb || ''}
                rows={2}
                onChange={(e) => setNpcDraft(npcDraft.id, 'blurb', e.target.value)}
              />
            </label>
          ) : (
            <p className="account-muted">{item.blurb}</p>
          )}
          {isExpanded && (
            <div className="view-card__body">
              <p className="account-muted">Related Locations</p>
              <div className="mini-list">
                {locationOptions.length
                  ? locationOptions
                      .filter((loc) => npcDraft.locationId && String(loc.id) === String(npcDraft.locationId))
                      .map((loc) => <span key={loc.id}>{loc.name}</span>)
                  : <span>None linked.</span>}
              </div>
              {isAdmin && adminView && (
                <div className="view-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="admin-toggle-btn"
                    disabled={savingNpcId === item.id}
                    onClick={() => saveNpc(item.id)}
                  >
                    {savingNpcId === item.id ? 'Saving...' : 'Save NPC'}
                  </button>
                </div>
              )}
              {isAdmin && adminView && item.secretId && (
                <div className="secret-meta">
                  <p className="account-muted">Requires secret: {item.secretId}</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    if (tab === 'locations') {
      const locDraft = mergedLoc(item);
      const relatedNpcs = (npcItems.length ? npcItems : npcsData).filter(
        (n) => n.locationId && String(n.locationId) === String(locDraft.id)
      );
      const relatedChars = players.filter((p) => p.locationId && String(p.locationId) === String(locDraft.id));
      const heroImage = locDraft.heroImage || locDraft.image || locDraft.imageUrl || '';
      const theme = CARD_THEMES.find((opt) => opt.id === locDraft.cardStyle) || CARD_THEMES[0];
      const titleContent = adminView && isAdmin ? (
        <div>
          <p className="account-card__eyebrow">{locDraft.category || locDraft.type}</p>
          <h3>{locDraft.name}</h3>
        </div>
      ) : (
        <>
          <p className="account-card__eyebrow">{item.category || item.type}</p>
          <h3>{item.name}</h3>
        </>
      );
      return (
        <div
          className={`view-card view-card--media ${isExpanded ? 'view-card--expanded' : ''} ${isDragging ? 'view-card--dragging' : ''}`}
          style={{ background: theme.background, color: theme.foreground }}
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          {...dragProps}
        >
          <div className="view-card__media">
            {heroImage ? (
              <img src={heroImage} alt={`${locDraft.name} illustration`} />
            ) : (
              <div className="view-card__media-placeholder">No image yet. Drop one in editor mode.</div>
            )}
            <div className="view-card__title-overlay">
              <div>{titleContent}</div>
              <div className="view-card__media-actions">
                {(isExpanded || (adminView && isAdmin)) && user && (
                  <button
                    type="button"
                    className={`fav-btn ${viewFavorites.includes(`location:${item.id}`) ? 'fav-btn--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    disabled={favPending}
                  >
                    {viewFavorites.includes(`location:${item.id}`) ? '★' : '☆'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {isExpanded && (
            <div
              className={`view-card__expanded ${adminView && isAdmin ? 'view-card__expanded--admin' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="view-card__details">
                <div className="view-card__detail-block">
                  <p className="detail-label">Description</p>
                  <p>{locDraft.description || 'No description provided.'}</p>
                </div>
                <div className="view-card__detail-block">
                  <p className="detail-label">NPCs here</p>
                  <div className="mini-list">
                    {relatedNpcs.length ? relatedNpcs.map((n) => <span key={n.id}>{n.name}</span>) : <span>No NPCs linked.</span>}
                  </div>
                </div>
                <div className="view-card__detail-block">
                  <p className="detail-label">Characters here</p>
                  <div className="mini-list">
                    {relatedChars.length ? relatedChars.map((c) => <span key={c.id}>{c.name}</span>) : <span>No characters linked.</span>}
                  </div>
                </div>
                {heroImage && (
                  <div className="view-card__detail-image">
                    <img src={heroImage} alt={`${locDraft.name} detail`} />
                  </div>
                )}
                {isAdmin && adminView && item.secretId && (
                  <div className="secret-meta">
                    <p className="account-muted">Requires secret: {item.secretId}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderEditorPanel = () => {
    if (!adminView || !isAdmin || !editingCard) return null;
    if (editingCard.type === 'locations') {
      const source = locItems.find((loc) => String(loc.id) === String(editingCard.id));
      if (!source) return null;
      const draft = mergedLoc(source);
      const heroImage = draft.heroImage || draft.image || draft.imageUrl || '';
      return (
        <div className="editor-panel-overlay" onClick={closeEditor}>
          <div className="editor-panel" onClick={(e) => e.stopPropagation()}>
            <div className="editor-panel__header">
              <div>
                <p className="editor-panel__eyebrow">Location Editor</p>
                <h2>{draft.name || 'Unnamed Location'}</h2>
              </div>
              <button type="button" className="editor-panel__close" onClick={closeEditor} aria-label="Close editor">
                X
              </button>
            </div>
            <div className="editor-panel__tabs">
              {['details', 'visual'].map((tabName) => (
                <button
                  key={tabName}
                  type="button"
                  className={`editor-panel__tab ${editorTab === tabName ? 'editor-panel__tab--active' : ''}`}
                  onClick={() => setEditorTab(tabName)}
                >
                  {tabName === 'details' ? 'Details' : 'Visual'}
                </button>
              ))}
            </div>
            {editorTab === 'details' ? (
              <div className="editor-panel__content">
                <label className="admin-field">
                  <span>Category</span>
                  <input value={draft.category || ''} onChange={(e) => setLocDraft(draft.id, 'category', e.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Name</span>
                  <input value={draft.name || ''} onChange={(e) => setLocDraft(draft.id, 'name', e.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Description</span>
                  <textarea
                    value={draft.description || ''}
                    onChange={(e) => setLocDraft(draft.id, 'description', e.target.value)}
                    rows={3}
                  />
                </label>
                <label className="admin-field">
                  <span>Campaign</span>
                  <input value={draft.campaign || ''} onChange={(e) => setLocDraft(draft.id, 'campaign', e.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Region ID</span>
                  <input
                    value={draft.regionId ?? ''}
                    onChange={(e) => setLocDraft(draft.id, 'regionId', e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label className="admin-field">
                  <span>Marker ID</span>
                  <input
                    value={draft.markerId ?? ''}
                    onChange={(e) => setLocDraft(draft.id, 'markerId', e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label className="admin-field">
                  <span>Secret</span>
                  <select
                    value={draft.secretId || ''}
                    onChange={(e) => setLocDraft(draft.id, 'secretId', e.target.value || undefined)}
                  >
                    <option value="">None (public when visible)</option>
                    {SECRET_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="editor-panel__toggles">
                  <label className="visibility-toggle">
                    <input type="checkbox" checked={draft.visible !== false} onChange={() => toggleVisible(draft.id, 'loc')} />
                    <span>{draft.visible !== false ? 'Visible' : 'Hidden'}</span>
                  </label>
                  <label className="visibility-toggle">
                    <input type="checkbox" checked={draft.truesight || false} onChange={() => toggleTruesight(draft.id, 'loc')} />
                    <span>{draft.truesight ? 'Truesight' : 'No Truesight'}</span>
                  </label>
                </div>
                <div className="editor-panel__actions">
                  <button
                    type="button"
                    className="admin-toggle-btn"
                    onClick={() => saveLocation(draft.id)}
                    disabled={savingLocId === draft.id}
                  >
                    {savingLocId === draft.id ? 'Saving...' : 'Save Location'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="editor-panel__content">
                <div
                  className="view-card__image-drop"
                  onDrop={(e) => handleLocationImageDrop(e, draft.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <p>Drag & drop an image to update this location.</p>
                  <label className="view-card__image-upload">
                    Browse
                    <input type="file" accept="image/*" onChange={(e) => handleLocationImageBrowse(e, draft.id)} />
                  </label>
                  {heroImage && <img src={heroImage} alt={`${draft.name} preview`} />}
                </div>
                <p className="detail-label">Card Themes</p>
                <div className="visual-theme-grid">
                  {CARD_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`visual-theme ${draft.cardStyle === theme.id ? 'visual-theme--active' : ''}`}
                      style={{ background: theme.background, color: theme.foreground }}
                      onClick={() => setLocDraft(draft.id, 'cardStyle', theme.id)}
                    >
                      <span>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (editingCard.type === 'npcs') {
      const source = npcItems.find((npc) => String(npc.id) === String(editingCard.id));
      if (!source) return null;
      const draft = mergedNpc(source);
      const locationOptions = (locItems.length ? locItems : locationsData.locations || []).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      return (
        <div className="editor-panel-overlay" onClick={closeEditor}>
          <div className="editor-panel" onClick={(e) => e.stopPropagation()}>
            <div className="editor-panel__header">
              <div>
                <p className="editor-panel__eyebrow">NPC Editor</p>
                <h2>{draft.name || 'Unnamed NPC'}</h2>
              </div>
              <button type="button" className="editor-panel__close" onClick={closeEditor} aria-label="Close editor">
                X
              </button>
            </div>
            <div className="editor-panel__content">
              <label className="admin-field">
                <span>Role</span>
                <input value={draft.type || ''} onChange={(e) => setNpcDraft(draft.id, 'type', e.target.value)} />
              </label>
              <label className="admin-field">
                <span>Name</span>
                <input value={draft.name || ''} onChange={(e) => setNpcDraft(draft.id, 'name', e.target.value)} />
              </label>
              <label className="admin-field">
                <span>Blurb</span>
                <textarea value={draft.blurb || ''} onChange={(e) => setNpcDraft(draft.id, 'blurb', e.target.value)} rows={3} />
              </label>
              <label className="admin-field">
                <span>Campaign</span>
                <input value={draft.campaign || ''} onChange={(e) => setNpcDraft(draft.id, 'campaign', e.target.value)} />
              </label>
              <label className="admin-field">
                <span>Linked Location</span>
                <select
                  value={draft.locationId || ''}
                  onChange={(e) => setNpcDraft(draft.id, 'locationId', e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No location</option>
                  {locationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Secret</span>
                <select
                  value={draft.secretId || ''}
                  onChange={(e) => setNpcDraft(draft.id, 'secretId', e.target.value || undefined)}
                >
                  <option value="">None (public when visible)</option>
                  {SECRET_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="editor-panel__toggles">
                <label className="visibility-toggle">
                  <input type="checkbox" checked={draft.visible !== false} onChange={() => toggleVisible(draft.id, 'npc')} />
                  <span>{draft.visible !== false ? 'Visible' : 'Hidden'}</span>
                </label>
                <label className="visibility-toggle">
                  <input type="checkbox" checked={draft.truesight || false} onChange={() => toggleTruesight(draft.id, 'npc')} />
                  <span>{draft.truesight ? 'Truesight' : 'No Truesight'}</span>
                </label>
              </div>
              <div className="editor-panel__actions">
                <button
                  type="button"
                  className="admin-toggle-btn"
                  onClick={() => saveNpc(draft.id)}
                  disabled={savingNpcId === draft.id}
                >
                  {savingNpcId === draft.id ? 'Saving...' : 'Save NPC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="page-container people-page">
         <div className="people-page__scrim" aria-hidden="true" />
        <header className="characters-header">
          <div>
            <p className="account-card__eyebrow">People</p>
            <h1>Campaign View</h1>
            <p className="nav-hint">Browse visible players, NPCs, and locations. Admins can toggle visibility.</p>
          </div>
          {isAdmin && (
            <div className="admin-toggle">
              <button
                type="button"
                className={`admin-toggle-btn ${adminView ? 'admin-toggle-btn--active' : ''}`}
                onClick={() => setAdminView((v) => !v)}
              >
                {adminView ? 'Admin View' : 'User View'}
              </button>
              {!adminView && (
                <div className="mini-list" aria-label="Preview secrets">
                  {SECRET_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`secret-preview-button ${previewSecrets.includes(opt.id) ? 'secret-preview-button--active' : ''}`}
                      onClick={() =>
                        setPreviewSecrets((prev) =>
                          prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                        )
                      }
                    >
                      {previewSecrets.includes(opt.id) ? '★' : '☆'} {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </header>

        <div className="characters-tabs">
          {TABS.map((name) => (
            <button
              key={name}
              className={`tab-btn ${tab === name ? 'tab-btn--active' : ''}`}
              type="button"
              onClick={() => setTab(name)}
            >
              {name === 'players' && 'Players / Characters'}
              {name === 'npcs' && 'NPCs'}
            </button>
          ))}
          <div className="campaign-tabs">
            {CAMPAIGNS.map((c) => (
              <button
                key={c}
                className={`tab-btn ${campaign === c ? 'tab-btn--active' : ''}`}
                type="button"
                onClick={() => setCampaign(c)}
              >
                {c} Campaign
              </button>
            ))}
          </div>
        </div>

        {error && <p className="account-error">{error}</p>}

        <div className="view-grid">
          {orderedList.map((item) => (
            <div key={`${tab}-${item.id}`}>{renderCard(item)}</div>
          ))}
        </div>
      </div>
      {renderEditorPanel()}
    </>
  );
}

export default PeoplePage;
