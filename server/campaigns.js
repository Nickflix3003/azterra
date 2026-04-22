import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRequired, profileToUser, readUsers, sanitizeUser } from './utils.js';
import { db, throwIfError } from './db.js';
import {
  ensureCampaignWorkspace,
  ensureNotesBoardState,
  readCampaignWorkspaceIndex,
  readPlayerCharacters,
  writeCampaignWorkspaceIndex,
} from './campaignWorkspaceStore.js';
import { readLocationScene } from './locationSceneStore.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_FILE = path.join(__dirname, 'data', 'content.json');

function nowIso() {
  return new Date().toISOString();
}

function isApprovedMember(entry) {
  return entry?.status === 'approved';
}

function getMembership(workspace, userId) {
  return (workspace.members || []).find((entry) => String(entry.userId) === String(userId)) || null;
}

function isCampaignOwner(user, campaignRow) {
  return Boolean(user && campaignRow && String(campaignRow.owner_id) === String(user.id));
}

function isCampaignManager(user, campaignRow, workspace) {
  if (!user || !campaignRow) return false;
  if (user.role === 'admin') return true;
  if (isCampaignOwner(user, campaignRow)) return true;
  const membership = getMembership(workspace, user.id);
  return Boolean(membership && isApprovedMember(membership) && membership.role === 'co_dm');
}

function canViewCampaignWorkspace(user, campaignRow, workspace) {
  if (!user || !campaignRow) return false;
  if (isCampaignManager(user, campaignRow, workspace)) return true;
  const membership = getMembership(workspace, user.id);
  return Boolean(membership && isApprovedMember(membership));
}

function canSeePendingCampaign(user, campaignRow, workspace) {
  if (!user || !campaignRow) return false;
  if (isCampaignManager(user, campaignRow, workspace)) return true;
  const membership = getMembership(workspace, user.id);
  return membership?.status === 'pending';
}

function normalizeCampaignSummary(campaignRow, workspace, viewer) {
  const approvedMembers = (workspace.members || []).filter((entry) => entry.status === 'approved');
  const pendingMembers = (workspace.members || []).filter((entry) => entry.status === 'pending');
  const viewerMembership = getMembership(workspace, viewer?.id);
  return {
    id: campaignRow.id,
    name: campaignRow.name,
    description: campaignRow.description || '',
    ownerId: campaignRow.owner_id,
    ownerName: campaignRow.owner_name || 'Unknown',
    visibility: workspace.visibility || 'request',
    coDmIds: workspace.coDmIds || [],
    viewerStatus: isCampaignOwner(viewer, campaignRow)
      ? 'owner'
      : viewerMembership?.status || 'none',
    viewerRole: isCampaignOwner(viewer, campaignRow)
      ? 'owner'
      : viewerMembership?.role || 'viewer',
    pendingCount: pendingMembers.length,
    approvedCount: approvedMembers.length,
    attachedCharacterCount: (workspace.attachedCharacterIds || []).length,
    updatedAt: workspace.updatedAt || campaignRow.updated_at,
    createdAt: campaignRow.created_at,
    lastUsed: campaignRow.last_used,
  };
}

async function readContentEntries() {
  if (!existsSync(CONTENT_FILE)) return [];
  try {
    const raw = await fs.readFile(CONTENT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

async function readAllUsers() {
  const { data: profiles, error } = await db().from('profiles').select('*').order('created_at');
  throwIfError(error, 'campaign users fetch');
  const supabaseUsers = (profiles || []).map(profileToUser);
  const localUsers = (await readUsers()).map(sanitizeUser);
  const supabaseIds = new Set(supabaseUsers.map((user) => String(user.id)));
  const merged = [
    ...supabaseUsers,
    ...localUsers.filter((user) => !supabaseIds.has(String(user.id))),
  ];
  return merged.map((user) => ({
    id: String(user.id),
    name: user.name || user.username || user.email || 'Unnamed',
    email: user.email || '',
    username: user.username || '',
    role: user.role || 'guest',
  }));
}

function buildUserMap(users) {
  return new Map(users.map((user) => [String(user.id), user]));
}

function getOwnerDisplay(character, usersById) {
  const owner = usersById.get(String(character.ownerId));
  return owner?.name || owner?.username || owner?.email || 'Unknown';
}

function buildAttachedCharacters(workspace, playerCharacters, usersById) {
  const byId = new Map(playerCharacters.map((character) => [String(character.id), character]));
  return (workspace.attachedCharacterIds || [])
    .map((characterId) => {
      const character = byId.get(String(characterId));
      if (!character) return null;
      const attachment = workspace.attachments?.[String(characterId)] || null;
      const inventoryItems = (workspace.inventory?.items || []).filter(
        (item) => item.ownerType === 'character' && String(item.ownerId) === String(characterId)
      );
      return {
        ...character,
        ownerName: getOwnerDisplay(character, usersById),
        attachment: attachment || {
          characterId: String(characterId),
          nickname: '',
          currentHp: null,
          maxHp: null,
          status: 'active',
          notes: '',
          tags: [],
          updatedAt: null,
        },
        inventoryItems,
      };
    })
    .filter(Boolean);
}

function canEditCharacterAttachment(user, campaignRow, workspace, character) {
  if (!user || !character) return false;
  if (isCampaignManager(user, campaignRow, workspace)) return true;
  return String(character.ownerId) === String(user.id) && canViewCampaignWorkspace(user, campaignRow, workspace);
}

function canManageInventoryItem(user, campaignRow, workspace, item, attachedCharacters) {
  if (isCampaignManager(user, campaignRow, workspace)) return true;
  if (!item || !canViewCampaignWorkspace(user, campaignRow, workspace)) return false;
  if (item.ownerType !== 'character') return false;
  const character = attachedCharacters.find((entry) => String(entry.id) === String(item.ownerId));
  return Boolean(character && String(character.ownerId) === String(user.id));
}

function sortInventoryItems(items = []) {
  return [...items].sort((left, right) => {
    if ((left.ownerType || '') !== (right.ownerType || '')) {
      return String(left.ownerType || '').localeCompare(String(right.ownerType || ''));
    }
    if (String(left.ownerId || '') !== String(right.ownerId || '')) {
      return String(left.ownerId || '').localeCompare(String(right.ownerId || ''));
    }
    return Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
  });
}

async function buildBoardCatalog() {
  const [locationsResult, regionsResult, npcsResult, secretsResult, contentEntries] = await Promise.all([
    db().from('locations').select('id, name, type, region_id').order('name'),
    db().from('regions').select('id, name, category').order('name'),
    db().from('npcs').select('id, name, type, location_id, region_id, secret_id').order('name'),
    db().from('secrets').select('id, title, description').order('title'),
    readContentEntries(),
  ]);

  throwIfError(locationsResult.error, 'campaign board locations');
  throwIfError(regionsResult.error, 'campaign board regions');
  throwIfError(npcsResult.error, 'campaign board npcs');
  throwIfError(secretsResult.error, 'campaign board secrets');

  return {
    locations: (locationsResult.data || []).map((entry) => ({
      id: entry.id,
      refType: 'location',
      title: entry.name || 'Unnamed location',
      subtitle: entry.type || '',
      regionId: entry.region_id || null,
    })),
    regions: (regionsResult.data || []).map((entry) => ({
      id: entry.id,
      refType: 'region',
      title: entry.name || 'Unnamed region',
      subtitle: entry.category || '',
    })),
    npcs: (npcsResult.data || []).map((entry) => ({
      id: entry.id,
      refType: 'npc',
      title: entry.name || 'Unnamed NPC',
      subtitle: entry.type || '',
      locationId: entry.location_id || null,
      regionId: entry.region_id || null,
      secretId: entry.secret_id || null,
    })),
    content: contentEntries.map((entry) => ({
      id: entry.id,
      refType: 'content',
      title: entry.title || 'Untitled entry',
      subtitle: entry.type || '',
      secretId: entry.secretId || null,
    })),
    secrets: (secretsResult.data || []).map((entry) => ({
      id: entry.id,
      refType: 'secret',
      title: entry.title || 'Untitled secret',
      subtitle: entry.description || '',
    })),
  };
}

function buildLocationOptions(catalog) {
  return (catalog.locations || []).map((entry) => ({
    id: entry.id,
    name: entry.title,
    type: entry.subtitle,
  }));
}

function getCampaignLocationInfo(locationOptions = [], locationId) {
  return locationOptions.find((entry) => String(entry.id) === String(locationId)) || null;
}

function buildCampaignScenePayload(workspace, locationOptions, scene, viewerCanManage) {
  const currentLocationId = workspace.sessionState?.currentLocationId || null;
  const activeLocation = currentLocationId ? getCampaignLocationInfo(locationOptions, currentLocationId) : null;
  const revealEntry = currentLocationId ? workspace.sceneRevealState?.[String(currentLocationId)] : null;
  const revealedPoiIds = revealEntry?.revealedPoiIds || [];
  const visiblePoiSet = new Set(revealedPoiIds.map((entry) => String(entry)));
  const normalizedScene = scene || { imageUrl: '', assetPath: '', width: null, height: null, pois: [] };
  const pois = viewerCanManage
    ? normalizedScene.pois
    : normalizedScene.pois
        .filter((poi) => visiblePoiSet.has(String(poi.id)))
        .map((poi) => ({
          id: poi.id,
          name: poi.name,
          x: poi.x,
          y: poi.y,
          icon: poi.icon,
        }));

  return {
    currentLocationId,
    activeLocation,
    canManage: viewerCanManage,
    locationOptions,
    revealedPoiIds,
    scene: {
      imageUrl: normalizedScene.imageUrl || normalizedScene.assetPath || '',
      assetPath: normalizedScene.assetPath || '',
      width: normalizedScene.width ?? null,
      height: normalizedScene.height ?? null,
      pois,
    },
  };
}

function defaultTableCard(characterId, index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    characterId: String(characterId),
    x: 88 + col * 272,
    y: 64 + row * 198,
    size: index === 0 ? 'standard' : 'compact',
    zIndex: index + 1,
  };
}

function buildCampaignTableState(workspace, attachedCharacters = []) {
  const existingCards = new Map(
    (workspace.tableState?.cards || []).map((card) => [String(card.characterId), card])
  );
  const attachedIds = new Set(attachedCharacters.map((character) => String(character.id)));
  const cards = attachedCharacters.map((character, index) => {
    const fallback = defaultTableCard(character.id, index);
    const existing = existingCards.get(String(character.id)) || {};
    return {
      ...fallback,
      ...existing,
      characterId: String(character.id),
    };
  });
  const widgets = (workspace.tableState?.widgets || []).map((widget) => ({
    ...widget,
    attachedToCharacterId: attachedIds.has(String(widget.attachedToCharacterId || ''))
      ? String(widget.attachedToCharacterId)
      : null,
  }));

  return {
    cards,
    widgets,
    updatedAt: workspace.tableState?.updatedAt || workspace.updatedAt || null,
    updatedBy: workspace.tableState?.updatedBy || null,
  };
}

function buildCampaignPayload(campaignRow, workspace, viewer, usersById, playerCharacters, boardCatalog) {
  const { notesBoardState } = ensureNotesBoardState(workspace, String(viewer?.id || 'system'));
  const attachedCharacters = buildAttachedCharacters(workspace, playerCharacters, usersById);
  const inventoryItems = sortInventoryItems(workspace.inventory?.items || []);
  const membership = getMembership(workspace, viewer?.id);
  const canManage = isCampaignManager(viewer, campaignRow, workspace);
  const approvedMembers = (workspace.members || [])
    .filter((entry) => entry.status === 'approved')
    .map((entry) => ({
      ...entry,
      user: usersById.get(String(entry.userId)) || null,
    }));
  const pendingMembers = (workspace.members || [])
    .filter((entry) => entry.status === 'pending')
    .map((entry) => ({
      ...entry,
      user: usersById.get(String(entry.userId)) || null,
    }));

  return {
    id: campaignRow.id,
    name: campaignRow.name,
    description: campaignRow.description || '',
    ownerId: campaignRow.owner_id,
    ownerName: campaignRow.owner_name || 'Unknown',
    visibility: workspace.visibility || 'request',
    coDmIds: workspace.coDmIds || [],
    viewerStatus: isCampaignOwner(viewer, campaignRow)
      ? 'owner'
      : membership?.status || 'none',
    viewerRole: isCampaignOwner(viewer, campaignRow)
      ? 'owner'
      : membership?.role || 'viewer',
    canManage,
    canEditSession: canViewCampaignWorkspace(viewer, campaignRow, workspace),
    members: approvedMembers.map((entry) => ({
      userId: entry.userId,
      role: entry.role,
      status: entry.status,
      name: entry.user?.name || 'Unknown',
      email: entry.user?.email || '',
      username: entry.user?.username || '',
      isCoDm: entry.role === 'co_dm',
    })),
    pendingMembers: pendingMembers.map((entry) => ({
      userId: entry.userId,
      role: entry.role,
      status: entry.status,
      name: entry.user?.name || 'Unknown',
      email: entry.user?.email || '',
      username: entry.user?.username || '',
    })),
    attachedCharacters: attachedCharacters.map((character) => ({
      ...character,
      canEditSheet: canEditCharacterAttachment(viewer, campaignRow, workspace, character),
      canEditAttachment: canEditCharacterAttachment(viewer, campaignRow, workspace, character),
    })),
    inventory: {
      items: inventoryItems.map((item) => ({
        ...item,
        canManage: canManageInventoryItem(viewer, campaignRow, workspace, item, attachedCharacters),
      })),
    },
    notesBoardState,
    tableState: buildCampaignTableState(workspace, attachedCharacters),
    boardState: canManage ? workspace.boardState : null,
    sessionState: workspace.sessionState,
    locationOptions: buildLocationOptions(boardCatalog),
    createdAt: campaignRow.created_at,
    updatedAt: campaignRow.updated_at,
    lastUsed: campaignRow.last_used,
  };
}

async function readCampaignRow(campaignId) {
  const { data, error } = await db().from('campaigns').select('*').eq('id', campaignId).single();
  if (error?.code === 'PGRST116') return null;
  throwIfError(error, 'campaign fetch');
  return data;
}

async function touchCampaign(campaignId) {
  await db().from('campaigns').update({ last_used: nowIso() }).eq('id', campaignId);
}

router.get('/me', authRequired, async (req, res) => {
  try {
    const [{ data: campaignRows, error }, workspaceIndex] = await Promise.all([
      db().from('campaigns').select('*').order('last_used', { ascending: false }),
      readCampaignWorkspaceIndex(),
    ]);
    throwIfError(error, 'campaign list fetch');

    const accessible = [];
    const discoverable = [];

    (campaignRows || []).forEach((campaignRow) => {
      const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
      const summary = normalizeCampaignSummary(campaignRow, workspace, req.user);
      const membership = getMembership(workspace, req.user.id);
      if (isCampaignOwner(req.user, campaignRow) || membership) {
        accessible.push(summary);
        return;
      }
      if ((workspace.visibility || 'request') !== 'private') {
        discoverable.push(summary);
      }
    });

    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ campaigns: accessible, discoverableCampaigns: discoverable });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaigns.' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const [workspaceIndex, users, playerCharacters, boardCatalog] = await Promise.all([
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
      buildBoardCatalog(),
    ]);
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);

    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      if (canSeePendingCampaign(req.user, campaignRow, workspace)) {
        return res.json({
          campaign: {
            ...normalizeCampaignSummary(campaignRow, workspace, req.user),
            pendingOnly: true,
          },
        });
      }
      return res.status(403).json({ error: 'You do not have access to this campaign.' });
    }

    const usersById = buildUserMap(users);
    const payload = buildCampaignPayload(campaignRow, workspace, req.user, usersById, playerCharacters, boardCatalog);
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ campaign: payload });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign.' });
  }
});

router.get('/:id/table', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const [workspaceIndex, users, playerCharacters, boardCatalog] = await Promise.all([
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
      buildBoardCatalog(),
    ]);
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);

    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      if (canSeePendingCampaign(req.user, campaignRow, workspace)) {
        return res.json({
          campaign: {
            ...normalizeCampaignSummary(campaignRow, workspace, req.user),
            pendingOnly: true,
          },
        });
      }
      return res.status(403).json({ error: 'You do not have access to this campaign.' });
    }

    const usersById = buildUserMap(users);
    const payload = buildCampaignPayload(campaignRow, workspace, req.user, usersById, playerCharacters, boardCatalog);
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ campaign: payload });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign tabletop.' });
  }
});

router.get('/:id/notes-board', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You do not have access to this campaign notes board.' });
    }

    const { notesBoardState, changed } = ensureNotesBoardState(workspace, String(req.user.id));
    if (changed) {
      await writeCampaignWorkspaceIndex(workspaceIndex);
    }

    return res.json({
      notesBoardState,
      canEdit: canViewCampaignWorkspace(req.user, campaignRow, workspace),
      canManage: isCampaignManager(req.user, campaignRow, workspace),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign notes board.' });
  }
});

router.patch('/:id/notes-board', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only approved campaign members can edit the notes board.' });
    }

    const { notesBoardState: existing } = ensureNotesBoardState(workspace, String(req.user.id));
    workspace.notesBoardState = {
      ...existing,
      ...(Array.isArray(req.body?.notes) ? { notes: req.body.notes } : {}),
      ...(Array.isArray(req.body?.strokes) ? { strokes: req.body.strokes } : {}),
      ...(Array.isArray(req.body?.connectors) ? { connectors: req.body.connectors } : {}),
      initialized: true,
      version: Math.max(1, Number(existing.version || 1) + 1),
      updatedAt: nowIso(),
      updatedBy: String(req.user.id),
    };
    workspace.updatedAt = workspace.notesBoardState.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);

    const { notesBoardState } = ensureNotesBoardState(workspace, String(req.user.id));
    return res.json({ notesBoardState });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign notes board.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Campaign name is required.' });
  }

  try {
    const { data, error } = await db()
      .from('campaigns')
      .insert({
        name,
        description,
        owner_id: req.user.id,
        owner_name: req.user.name || req.user.email || 'Unknown',
      })
      .select()
      .single();
    throwIfError(error, 'campaign create');

    const workspaceIndex = await readCampaignWorkspaceIndex();
    const workspace = ensureCampaignWorkspace(workspaceIndex, data.id);
    workspace.visibility = 'request';
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.status(201).json({ campaign: normalizeCampaignSummary(data, workspace, req.user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create campaign.' });
  }
});

router.patch('/:id', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspaceIndex = await readCampaignWorkspaceIndex();
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can update this campaign.' });
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      patch.name = String(req.body.name || '').trim() || campaignRow.name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'description')) {
      patch.description = String(req.body.description || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'sessionNotes')) {
      patch.session_notes = Array.isArray(req.body.sessionNotes) ? req.body.sessionNotes : [];
    }

    let nextRow = campaignRow;
    if (Object.keys(patch).length) {
      const { data, error } = await db()
        .from('campaigns')
        .update(patch)
        .eq('id', campaignRow.id)
        .select()
        .single();
      throwIfError(error, 'campaign update');
      nextRow = data;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'visibility')) {
      workspace.visibility = String(req.body.visibility || 'request');
    }
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ campaign: normalizeCampaignSummary(nextRow, workspace, req.user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign.' });
  }
});

router.patch('/:id/table', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, users, playerCharacters, boardCatalog] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
      buildBoardCatalog(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can update the tabletop layout.' });
    }

    const existing = workspace.tableState || { cards: [], widgets: [], updatedAt: null, updatedBy: null };
    workspace.tableState = {
      ...existing,
      ...(Array.isArray(req.body?.cards) ? { cards: req.body.cards } : {}),
      ...(Array.isArray(req.body?.widgets) ? { widgets: req.body.widgets } : {}),
      updatedAt: nowIso(),
      updatedBy: String(req.user.id),
    };
    workspace.updatedAt = workspace.tableState.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);

    const usersById = buildUserMap(users);
    const payload = buildCampaignPayload(campaignRow, workspace, req.user, usersById, playerCharacters, boardCatalog);
    return res.json({ tableState: payload.tableState });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign tabletop.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    if (!isCampaignOwner(req.user, campaignRow) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the campaign owner can delete this campaign.' });
    }

    const { error } = await db().from('campaigns').delete().eq('id', campaignRow.id);
    throwIfError(error, 'campaign delete');

    const workspaceIndex = await readCampaignWorkspaceIndex();
    delete workspaceIndex.campaigns[String(campaignRow.id)];
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete campaign.' });
  }
});

router.post('/:id/join', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspaceIndex = await readCampaignWorkspaceIndex();
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (isCampaignOwner(req.user, campaignRow)) {
      return res.status(400).json({ error: 'You already own this campaign.' });
    }
    const existing = getMembership(workspace, req.user.id);
    if (existing?.status === 'approved') {
      return res.status(400).json({ error: 'You are already in this campaign.' });
    }
    const now = nowIso();
    if (existing) {
      existing.status = 'pending';
      existing.role = 'player';
      existing.updatedAt = now;
    } else {
      workspace.members.push({
        userId: String(req.user.id),
        status: 'pending',
        role: 'player',
        createdAt: now,
        updatedAt: now,
      });
    }
    workspace.updatedAt = now;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ success: true, membership: getMembership(workspace, req.user.id) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to request access to this campaign.' });
  }
});

router.get('/:id/members', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const [workspaceIndex, users] = await Promise.all([
      readCampaignWorkspaceIndex(),
      readAllUsers(),
    ]);
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You do not have access to this campaign.' });
    }
    const usersById = buildUserMap(users);
    const memberships = (workspace.members || []).map((entry) => ({
      ...entry,
      name: usersById.get(String(entry.userId))?.name || 'Unknown',
      email: usersById.get(String(entry.userId))?.email || '',
      username: usersById.get(String(entry.userId))?.username || '',
    }));
    return res.json({
      members: memberships,
      owner: usersById.get(String(campaignRow.owner_id)) || {
        id: String(campaignRow.owner_id),
        name: campaignRow.owner_name || 'Unknown',
        email: '',
        username: '',
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign members.' });
  }
});

router.patch('/:id/members/:userId', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspaceIndex = await readCampaignWorkspaceIndex();
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can manage members.' });
    }

    const membership = getMembership(workspace, req.params.userId);
    if (!membership) {
      return res.status(404).json({ error: 'Campaign member not found.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      membership.status = ['pending', 'approved', 'rejected', 'left'].includes(req.body.status)
        ? req.body.status
        : membership.status;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      membership.role = req.body.role === 'co_dm' ? 'co_dm' : 'player';
    }
    membership.updatedAt = nowIso();
    workspace.coDmIds = workspace.members
      .filter((entry) => entry.status === 'approved' && entry.role === 'co_dm')
      .map((entry) => String(entry.userId));
    workspace.updatedAt = membership.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ success: true, membership });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign membership.' });
  }
});

router.delete('/:id/members/:userId', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const [workspaceIndex, playerCharacters] = await Promise.all([
      readCampaignWorkspaceIndex(),
      readPlayerCharacters(),
    ]);
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can remove members.' });
    }
    workspace.members = (workspace.members || []).filter(
      (entry) => String(entry.userId) !== String(req.params.userId)
    );
    const removedCharacterIds = playerCharacters
      .filter((character) => String(character.ownerId) === String(req.params.userId))
      .map((character) => String(character.id));
    workspace.attachedCharacterIds = (workspace.attachedCharacterIds || []).filter(
      (characterId) => !removedCharacterIds.includes(String(characterId))
    );
    removedCharacterIds.forEach((characterId) => {
      if (workspace.attachments?.[characterId]) {
        delete workspace.attachments[characterId];
      }
    });
    workspace.inventory.items = (workspace.inventory?.items || []).map((item) =>
      item.ownerType === 'character' && removedCharacterIds.includes(String(item.ownerId))
        ? { ...item, ownerType: 'stash', ownerId: null, updatedAt: nowIso() }
        : item
    );
    workspace.coDmIds = workspace.members
      .filter((entry) => entry.status === 'approved' && entry.role === 'co_dm')
      .map((entry) => String(entry.userId));
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to remove campaign member.' });
  }
});

router.post('/:id/characters/attach', authRequired, async (req, res) => {
  const characterId = String(req.body?.characterId || '').trim();
  if (!characterId) {
    return res.status(400).json({ error: 'A characterId is required.' });
  }
  try {
    const [campaignRow, workspaceIndex, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You are not approved for this campaign.' });
    }
    const character = playerCharacters.find((entry) => String(entry.id) === characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found.' });
    }
    if (String(character.ownerId) !== String(req.user.id) && !isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only the owner or DM can attach this character.' });
    }

    if (!workspace.attachedCharacterIds.includes(characterId)) {
      workspace.attachedCharacterIds.push(characterId);
    }
    workspace.attachments[characterId] = workspace.attachments[characterId] || {
      characterId,
      nickname: '',
      currentHp: character.hp ?? null,
      maxHp: character.maxHp ?? null,
      status: 'active',
      notes: '',
      tags: [],
      updatedAt: nowIso(),
    };
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ success: true, attachment: workspace.attachments[characterId] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to attach character to campaign.' });
  }
});

router.patch('/:id/characters/:charId', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    const character = playerCharacters.find((entry) => String(entry.id) === String(req.params.charId));
    if (!character || !workspace.attachedCharacterIds.includes(String(req.params.charId))) {
      return res.status(404).json({ error: 'Attached character not found.' });
    }
    if (!canEditCharacterAttachment(req.user, campaignRow, workspace, character)) {
      return res.status(403).json({ error: 'You cannot edit this campaign character.' });
    }

    const existing = workspace.attachments[String(req.params.charId)] || {
      characterId: String(req.params.charId),
      nickname: '',
      currentHp: character.hp ?? null,
      maxHp: character.maxHp ?? null,
      status: 'active',
      notes: '',
      tags: [],
      updatedAt: nowIso(),
    };
    workspace.attachments[String(req.params.charId)] = {
      ...existing,
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'nickname') ? { nickname: String(req.body.nickname || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'currentHp') ? { currentHp: req.body.currentHp === null ? null : Number(req.body.currentHp) } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'maxHp') ? { maxHp: req.body.maxHp === null ? null : Number(req.body.maxHp) } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'status') ? { status: String(req.body.status || 'active').trim() || 'active' } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'notes') ? { notes: String(req.body.notes || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'tags') ? { tags: Array.isArray(req.body.tags) ? req.body.tags.map((entry) => String(entry).trim()).filter(Boolean) : [] } : {}),
      updatedAt: nowIso(),
    };
    workspace.updatedAt = workspace.attachments[String(req.params.charId)].updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ success: true, attachment: workspace.attachments[String(req.params.charId)] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign character.' });
  }
});

router.delete('/:id/characters/:charId', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    const character = playerCharacters.find((entry) => String(entry.id) === String(req.params.charId));
    if (!character || !workspace.attachedCharacterIds.includes(String(req.params.charId))) {
      return res.status(404).json({ error: 'Attached character not found.' });
    }
    if (String(character.ownerId) !== String(req.user.id) && !isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only the owner or DM can detach this character.' });
    }
    workspace.attachedCharacterIds = workspace.attachedCharacterIds.filter(
      (entry) => String(entry) !== String(req.params.charId)
    );
    delete workspace.attachments[String(req.params.charId)];
    workspace.inventory.items = (workspace.inventory?.items || []).map((item) =>
      item.ownerType === 'character' && String(item.ownerId) === String(req.params.charId)
        ? { ...item, ownerType: 'stash', ownerId: null, updatedAt: nowIso() }
        : item
    );
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to detach character.' });
  }
});

router.get('/:id/inventory', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, users, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You do not have access to this campaign.' });
    }
    const attachedCharacters = buildAttachedCharacters(workspace, playerCharacters, buildUserMap(users));
    const items = sortInventoryItems(workspace.inventory?.items || []).map((item) => ({
      ...item,
      canManage: canManageInventoryItem(req.user, campaignRow, workspace, item, attachedCharacters),
    }));
    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign inventory.' });
  }
});

router.post('/:id/inventory/items', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can create items.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Item name is required.' });
    }

    const item = {
      id: String(req.body?.id || `item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      name,
      type: String(req.body?.type || 'gear').trim() || 'gear',
      quantity: Math.max(1, Number(req.body?.quantity) || 1),
      notes: String(req.body?.notes || '').trim(),
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
      ownerType: req.body?.ownerType || 'stash',
      ownerId: req.body?.ownerId || null,
      createdBy: req.user.id,
      sortOrder: (workspace.inventory?.items || []).length,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    workspace.inventory.items.push(item);
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.status(201).json({ item });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create campaign item.' });
  }
});

router.patch('/:id/inventory/items/:itemId', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, users, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    const attachedCharacters = buildAttachedCharacters(workspace, playerCharacters, buildUserMap(users));
    const item = (workspace.inventory?.items || []).find((entry) => String(entry.id) === String(req.params.itemId));
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    if (!isCampaignManager(req.user, campaignRow, workspace) && !canManageInventoryItem(req.user, campaignRow, workspace, item, attachedCharacters)) {
      return res.status(403).json({ error: 'You cannot edit this item.' });
    }

    Object.assign(item, {
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'name') ? { name: String(req.body.name || '').trim() || item.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'type') ? { type: String(req.body.type || '').trim() || item.type } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'quantity') ? { quantity: Math.max(1, Number(req.body.quantity) || 1) } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'notes') ? { notes: String(req.body.notes || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'tags') ? { tags: Array.isArray(req.body.tags) ? req.body.tags.map((entry) => String(entry).trim()).filter(Boolean) : [] } : {}),
      updatedAt: nowIso(),
    });
    workspace.updatedAt = item.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ item });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign item.' });
  }
});

router.post('/:id/inventory/move', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, users, playerCharacters] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      readAllUsers(),
      readPlayerCharacters(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    const attachedCharacters = buildAttachedCharacters(workspace, playerCharacters, buildUserMap(users));
    const item = (workspace.inventory?.items || []).find((entry) => String(entry.id) === String(req.body?.itemId || ''));
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const isManager = isCampaignManager(req.user, campaignRow, workspace);
    const canMove = isManager || canManageInventoryItem(req.user, campaignRow, workspace, item, attachedCharacters);
    if (!canMove) {
      return res.status(403).json({ error: 'You cannot move this item.' });
    }

    const targetOwnerType = req.body?.ownerType === 'character' ? 'character' : 'stash';
    const targetOwnerId = targetOwnerType === 'character' ? String(req.body?.ownerId || '') : null;
    if (targetOwnerType === 'character') {
      const targetCharacter = attachedCharacters.find((entry) => String(entry.id) === targetOwnerId);
      if (!targetCharacter) {
        return res.status(400).json({ error: 'Target character not found in this campaign.' });
      }
      if (!isManager && String(targetCharacter.ownerId) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You can only move items to your own character.' });
      }
    }

    item.ownerType = targetOwnerType;
    item.ownerId = targetOwnerId || null;
    item.sortOrder = Number(req.body?.sortOrder) || 0;
    item.updatedAt = nowIso();
    workspace.updatedAt = item.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ item });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to move campaign item.' });
  }
});

router.get('/:id/scene', authRequired, async (req, res) => {
  try {
    const campaignRow = await readCampaignRow(req.params.id);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const [workspaceIndex, boardCatalog] = await Promise.all([
      readCampaignWorkspaceIndex(),
      buildBoardCatalog(),
    ]);
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You do not have access to this campaign scene.' });
    }

    const locationOptions = buildLocationOptions(boardCatalog);
    const currentLocationId = workspace.sessionState?.currentLocationId || null;
    const scene = currentLocationId ? await readLocationScene(currentLocationId) : null;
    return res.json({
      sceneState: buildCampaignScenePayload(
        workspace,
        locationOptions,
        scene,
        isCampaignManager(req.user, campaignRow, workspace)
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign scene.' });
  }
});

router.patch('/:id/scene', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex, boardCatalog] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
      buildBoardCatalog(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can update the campaign scene.' });
    }

    const locationOptions = buildLocationOptions(boardCatalog);
    const nextCurrentLocationId = Object.prototype.hasOwnProperty.call(req.body || {}, 'currentLocationId')
      ? (req.body.currentLocationId ? String(req.body.currentLocationId) : null)
      : workspace.sessionState?.currentLocationId || null;

    if (nextCurrentLocationId && !getCampaignLocationInfo(locationOptions, nextCurrentLocationId)) {
      return res.status(400).json({ error: 'Current location is not valid for this campaign.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'currentLocationId')) {
      workspace.sessionState = {
        ...workspace.sessionState,
        currentLocationId: nextCurrentLocationId,
        updatedAt: nowIso(),
      };
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'revealedPoiIds')) {
      const targetLocationId = String(req.body?.locationId || nextCurrentLocationId || '');
      if (!targetLocationId) {
        return res.status(400).json({ error: 'A locationId is required when updating scene reveals.' });
      }

      workspace.sceneRevealState = {
        ...(workspace.sceneRevealState || {}),
        [targetLocationId]: {
          revealedPoiIds: Array.isArray(req.body.revealedPoiIds)
            ? Array.from(new Set(req.body.revealedPoiIds.map((entry) => String(entry).trim()).filter(Boolean)))
            : [],
          updatedAt: nowIso(),
        },
      };
    }

    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);

    const scene = nextCurrentLocationId ? await readLocationScene(nextCurrentLocationId) : null;
    return res.json({
      sceneState: buildCampaignScenePayload(workspace, locationOptions, scene, true),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign scene.' });
  }
});

router.delete('/:id/inventory/items/:itemId', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can delete items.' });
    }
    workspace.inventory.items = (workspace.inventory?.items || []).filter(
      (entry) => String(entry.id) !== String(req.params.itemId)
    );
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete campaign item.' });
  }
});

router.get('/:id/board', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can access the DM board.' });
    }
    const catalog = await buildBoardCatalog();
    return res.json({ boardState: workspace.boardState, catalog });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign board.' });
  }
});

router.patch('/:id/board', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!isCampaignManager(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only campaign managers can update the DM board.' });
    }
    workspace.boardState = {
      cards: Array.isArray(req.body?.cards) ? req.body.cards : workspace.boardState.cards,
      columns: {
        hidden: Array.isArray(req.body?.columns?.hidden) ? req.body.columns.hidden : workspace.boardState.columns.hidden,
        active: Array.isArray(req.body?.columns?.active) ? req.body.columns.active : workspace.boardState.columns.active,
        revealed: Array.isArray(req.body?.columns?.revealed) ? req.body.columns.revealed : workspace.boardState.columns.revealed,
      },
    };
    workspace.updatedAt = nowIso();
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ boardState: workspace.boardState });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign board.' });
  }
});

router.get('/:id/session', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'You do not have access to this campaign session.' });
    }
    const catalog = await buildBoardCatalog();
    return res.json({ sessionState: workspace.sessionState, locationOptions: buildLocationOptions(catalog) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load campaign session.' });
  }
});

router.patch('/:id/session', authRequired, async (req, res) => {
  try {
    const [campaignRow, workspaceIndex] = await Promise.all([
      readCampaignRow(req.params.id),
      readCampaignWorkspaceIndex(),
    ]);
    if (!campaignRow) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
    if (!canViewCampaignWorkspace(req.user, campaignRow, workspace)) {
      return res.status(403).json({ error: 'Only approved campaign members can edit the session.' });
    }
    workspace.sessionState = {
      ...workspace.sessionState,
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'title') ? { title: String(req.body.title || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'summary') ? { summary: String(req.body.summary || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'notes') ? { notes: String(req.body.notes || '').trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'objectives') ? { objectives: Array.isArray(req.body.objectives) ? req.body.objectives.map((entry) => String(entry).trim()).filter(Boolean) : [] } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'recentLoot') ? { recentLoot: Array.isArray(req.body.recentLoot) ? req.body.recentLoot.map((entry) => String(entry).trim()).filter(Boolean) : [] } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'currentLocationId') ? { currentLocationId: req.body.currentLocationId ? String(req.body.currentLocationId) : null } : {}),
      updatedAt: nowIso(),
    };
    workspace.updatedAt = workspace.sessionState.updatedAt;
    await writeCampaignWorkspaceIndex(workspaceIndex);
    await touchCampaign(campaignRow.id);
    return res.json({ sessionState: workspace.sessionState });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update campaign session.' });
  }
});

export default router;
