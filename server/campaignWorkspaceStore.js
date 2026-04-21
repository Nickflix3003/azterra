import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const WORKSPACE_FILE = path.join(DATA_DIR, 'campaign-workspaces.json');
const PLAYER_CHARACTERS_FILE = path.join(DATA_DIR, 'playerCharacters.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeArray(values) {
  return Array.isArray(values) ? values : [];
}

function normalizeStringArray(values = []) {
  return Array.from(
    new Set(
      normalizeArray(values)
        .map((value) => normalizeString(value))
        .filter(Boolean)
    )
  );
}

function normalizeNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMembership(entry = {}) {
  const now = nowIso();
  return {
    userId: normalizeString(entry.userId),
    status: ['pending', 'approved', 'rejected', 'left'].includes(entry.status) ? entry.status : 'pending',
    role: entry.role === 'co_dm' ? 'co_dm' : 'player',
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
  };
}

function normalizeAttachment(entry = {}) {
  const now = nowIso();
  return {
    characterId: normalizeString(entry.characterId),
    nickname: normalizeString(entry.nickname),
    currentHp: normalizeNumber(entry.currentHp, null),
    maxHp: normalizeNumber(entry.maxHp, null),
    status: normalizeString(entry.status, 'active') || 'active',
    notes: normalizeString(entry.notes),
    tags: normalizeStringArray(entry.tags),
    updatedAt: entry.updatedAt || now,
  };
}

function normalizeInventoryItem(item = {}) {
  const now = nowIso();
  return {
    id: normalizeString(item.id) || randomUUID(),
    name: normalizeString(item.name, 'Unnamed Item') || 'Unnamed Item',
    type: normalizeString(item.type, 'gear') || 'gear',
    quantity: Math.max(1, normalizeNumber(item.quantity, 1) || 1),
    notes: normalizeString(item.notes),
    tags: normalizeStringArray(item.tags),
    ownerType: ['stash', 'character'].includes(item.ownerType) ? item.ownerType : 'stash',
    ownerId: normalizeString(item.ownerId) || null,
    createdBy: normalizeString(item.createdBy) || null,
    sortOrder: normalizeNumber(item.sortOrder, 0) || 0,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  };
}

function normalizeBoardCard(card = {}) {
  const now = nowIso();
  return {
    id: normalizeString(card.id) || randomUUID(),
    refType: ['location', 'region', 'npc', 'content', 'secret', 'note'].includes(card.refType)
      ? card.refType
      : 'note',
    refId: normalizeString(card.refId) || null,
    title: normalizeString(card.title, 'Untitled Card') || 'Untitled Card',
    subtitle: normalizeString(card.subtitle),
    note: normalizeString(card.note),
    status: normalizeString(card.status, 'open') || 'open',
    published: Boolean(card.published),
    assignedCharacterId: normalizeString(card.assignedCharacterId) || null,
    lane: normalizeString(card.lane) || null,
    createdAt: card.createdAt || now,
    updatedAt: card.updatedAt || now,
  };
}

function normalizeBoardState(state = {}) {
  return {
    cards: normalizeArray(state.cards).map(normalizeBoardCard),
    columns: {
      hidden: normalizeStringArray(state.columns?.hidden),
      active: normalizeStringArray(state.columns?.active),
      revealed: normalizeStringArray(state.columns?.revealed),
    },
  };
}

function normalizeSessionState(state = {}) {
  return {
    title: normalizeString(state.title),
    summary: normalizeString(state.summary),
    notes: normalizeString(state.notes),
    objectives: normalizeArray(state.objectives).map((entry) => normalizeString(entry)).filter(Boolean),
    recentLoot: normalizeArray(state.recentLoot).map((entry) => normalizeString(entry)).filter(Boolean),
    currentLocationId: normalizeString(state.currentLocationId) || null,
    updatedAt: state.updatedAt || null,
  };
}

function normalizeWorkspace(workspace = {}, campaignId = '') {
  const now = nowIso();
  const attachmentsArray = normalizeArray(workspace.attachments);
  const attachmentsMap =
    !attachmentsArray.length && workspace.attachments && typeof workspace.attachments === 'object'
      ? Object.values(workspace.attachments)
      : attachmentsArray;

  const next = {
    campaignId: normalizeString(workspace.campaignId || campaignId),
    visibility: normalizeString(workspace.visibility, 'request') || 'request',
    coDmIds: normalizeStringArray(workspace.coDmIds),
    members: normalizeArray(workspace.members)
      .map(normalizeMembership)
      .filter((entry) => entry.userId),
    attachedCharacterIds: normalizeStringArray(workspace.attachedCharacterIds),
    attachments: Object.fromEntries(
      attachmentsMap
        .map(normalizeAttachment)
        .filter((entry) => entry.characterId)
        .map((entry) => [entry.characterId, entry])
    ),
    inventory: {
      items: normalizeArray(workspace.inventory?.items).map(normalizeInventoryItem),
    },
    boardState: normalizeBoardState(workspace.boardState),
    sessionState: normalizeSessionState(workspace.sessionState),
    createdAt: workspace.createdAt || now,
    updatedAt: workspace.updatedAt || now,
  };

  return next;
}

function normalizePlayerCharacter(character = {}) {
  const now = nowIso();
  return {
    id: normalizeString(character.id) || randomUUID(),
    ownerId: normalizeString(character.ownerId),
    name: normalizeString(character.name),
    race: normalizeString(character.race),
    class: normalizeString(character.class),
    subclass: normalizeString(character.subclass),
    level: Math.max(1, normalizeNumber(character.level, 1) || 1),
    background: normalizeString(character.background),
    alignment: normalizeString(character.alignment),
    stats: {
      str: normalizeNumber(character.stats?.str, 10) || 10,
      dex: normalizeNumber(character.stats?.dex, 10) || 10,
      con: normalizeNumber(character.stats?.con, 10) || 10,
      int: normalizeNumber(character.stats?.int, 10) || 10,
      wis: normalizeNumber(character.stats?.wis, 10) || 10,
      cha: normalizeNumber(character.stats?.cha, 10) || 10,
    },
    hp: normalizeNumber(character.hp, 0) || 0,
    maxHp: normalizeNumber(character.maxHp, 0) || 0,
    ac: normalizeNumber(character.ac, 10) || 10,
    speed: normalizeNumber(character.speed, 30) || 30,
    initiative: normalizeNumber(character.initiative, null),
    hitDice: normalizeString(character.hitDice),
    proficiencyBonus: normalizeNumber(character.proficiencyBonus, 2) || 2,
    savingThrows: character.savingThrows && typeof character.savingThrows === 'object' ? character.savingThrows : {},
    skills: character.skills && typeof character.skills === 'object' ? character.skills : {},
    equipment: normalizeArray(character.equipment).map((entry) => normalizeString(entry)).filter(Boolean),
    spells: normalizeArray(character.spells).map((entry) => normalizeString(entry)).filter(Boolean),
    abilities: normalizeArray(character.abilities).map((entry) => normalizeString(entry)).filter(Boolean),
    features: normalizeArray(character.features).map((entry) => normalizeString(entry)).filter(Boolean),
    languages: normalizeArray(character.languages).map((entry) => normalizeString(entry)).filter(Boolean),
    personalityTraits: normalizeString(character.personalityTraits),
    ideals: normalizeString(character.ideals),
    bonds: normalizeString(character.bonds),
    flaws: normalizeString(character.flaws),
    backstory: normalizeString(character.backstory),
    notes: normalizeString(character.notes),
    imageUrl: normalizeString(character.imageUrl) || null,
    color: normalizeString(character.color, '#cfaa68') || '#cfaa68',
    createdAt: character.createdAt || now,
    updatedAt: character.updatedAt || now,
  };
}

async function ensureFile(filePath, fallback) {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(filePath)) {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2));
  }
}

async function readJson(filePath, fallback) {
  await ensureFile(filePath, fallback);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await ensureFile(filePath, value);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function readCampaignWorkspaceIndex() {
  const parsed = await readJson(WORKSPACE_FILE, { campaigns: {} });
  const campaigns = parsed?.campaigns && typeof parsed.campaigns === 'object' ? parsed.campaigns : {};
  return {
    campaigns: Object.fromEntries(
      Object.entries(campaigns).map(([campaignId, workspace]) => [
        String(campaignId),
        normalizeWorkspace(workspace, campaignId),
      ])
    ),
  };
}

export async function writeCampaignWorkspaceIndex(index = { campaigns: {} }) {
  const campaigns = index?.campaigns && typeof index.campaigns === 'object' ? index.campaigns : {};
  await writeJson(WORKSPACE_FILE, {
    campaigns: Object.fromEntries(
      Object.entries(campaigns).map(([campaignId, workspace]) => [
        String(campaignId),
        normalizeWorkspace(workspace, campaignId),
      ])
    ),
  });
}

export function ensureCampaignWorkspace(index, campaignId) {
  const existing = index.campaigns[String(campaignId)];
  if (existing) return existing;
  const workspace = normalizeWorkspace({ campaignId }, campaignId);
  index.campaigns[String(campaignId)] = workspace;
  return workspace;
}

export async function readPlayerCharacters() {
  const parsed = await readJson(PLAYER_CHARACTERS_FILE, []);
  return normalizeArray(parsed)
    .map(normalizePlayerCharacter)
    .filter((character) => character.ownerId);
}

export async function writePlayerCharacters(characters = []) {
  await writeJson(
    PLAYER_CHARACTERS_FILE,
    normalizeArray(characters).map(normalizePlayerCharacter)
  );
}
