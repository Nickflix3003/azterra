import { Router } from 'express';
import { authRequired } from './utils.js';
import { db } from './db.js';
import {
  ensureCampaignWorkspace,
  readCampaignWorkspaceIndex,
  readPlayerCharacters,
  writePlayerCharacters,
} from './campaignWorkspaceStore.js';

const router = Router();

function canManageCampaignCharacter(user, campaignRow, workspace) {
  if (!user || !campaignRow) return false;
  if (user.role === 'admin') return true;
  if (String(campaignRow.owner_id) === String(user.id)) return true;
  const member = (workspace.members || []).find(
    (entry) => String(entry.userId) === String(user.id) && entry.status === 'approved'
  );
  return member?.role === 'co_dm';
}

function toClientCharacter(character) {
  return {
    ...character,
    canEdit: true,
  };
}

router.get('/me', authRequired, async (req, res) => {
  try {
    const characters = await readPlayerCharacters();
    return res.json({
      characters: characters
        .filter((character) => String(character.ownerId) === String(req.user.id))
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
        .map(toClientCharacter),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load player characters.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const characters = await readPlayerCharacters();
    const nextCharacter = {
      ...req.body,
      ownerId: String(req.user.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    characters.push(nextCharacter);
    await writePlayerCharacters(characters);
    const saved = (await readPlayerCharacters()).slice(-1)[0];
    return res.status(201).json({ character: toClientCharacter(saved) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create player character.' });
  }
});

router.patch('/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const characters = await readPlayerCharacters();
    const index = characters.findIndex((character) => String(character.id) === String(id));
    if (index === -1) {
      return res.status(404).json({ error: 'Character not found.' });
    }

    const existing = characters[index];
    let canEdit = String(existing.ownerId) === String(req.user.id) || req.user.role === 'admin';

    if (!canEdit && req.body?.campaignId) {
      const { data: campaignRow, error: campaignError } = await db()
        .from('campaigns')
        .select('*')
        .eq('id', req.body.campaignId)
        .single();
      if (!campaignError && campaignRow) {
        const workspaceIndex = await readCampaignWorkspaceIndex();
        const workspace = ensureCampaignWorkspace(workspaceIndex, campaignRow.id);
        const attached = workspace.attachedCharacterIds?.includes(String(existing.id));
        canEdit = attached && canManageCampaignCharacter(req.user, campaignRow, workspace);
      }
    }

    if (!canEdit) {
      return res.status(403).json({ error: 'You cannot edit this character.' });
    }

    characters[index] = {
      ...existing,
      ...req.body,
      id: existing.id,
      ownerId: existing.ownerId,
      updatedAt: new Date().toISOString(),
    };
    delete characters[index].campaignId;
    await writePlayerCharacters(characters);
    const refreshed = (await readPlayerCharacters()).find((character) => String(character.id) === String(id));
    return res.json({ character: toClientCharacter(refreshed) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update player character.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const characters = await readPlayerCharacters();
    const existing = characters.find((character) => String(character.id) === String(id));
    if (!existing) {
      return res.status(404).json({ error: 'Character not found.' });
    }
    if (String(existing.ownerId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the owner can delete this character.' });
    }

    await writePlayerCharacters(characters.filter((character) => String(character.id) !== String(id)));
    const workspaceIndex = await readCampaignWorkspaceIndex();
    Object.values(workspaceIndex.campaigns).forEach((workspace) => {
      workspace.attachedCharacterIds = (workspace.attachedCharacterIds || []).filter(
        (characterId) => String(characterId) !== String(id)
      );
      if (workspace.attachments?.[id]) {
        delete workspace.attachments[id];
      }
      workspace.inventory.items = (workspace.inventory?.items || []).map((item) =>
        item.ownerType === 'character' && String(item.ownerId) === String(id)
          ? { ...item, ownerType: 'stash', ownerId: null, updatedAt: new Date().toISOString() }
          : item
      );
    });
    await writeCampaignWorkspaceIndex(workspaceIndex);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete player character.' });
  }
});

export default router;
