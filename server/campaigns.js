import { Router } from 'express';
import { authRequired, editorRequired } from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();

// ── DB helpers ────────────────────────────────────────────────────────────────

function rowToCharacter(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name || 'Unnamed Character',
    race: row.race || '',
    class: row.class || '',
    subclass: row.subclass || '',
    level: row.level ?? 1,
    background: row.background || '',
    alignment: row.alignment || '',
    stats: row.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: row.hp ?? 0,
    maxHp: row.max_hp ?? 0,
    ac: row.ac ?? 10,
    speed: row.speed ?? 30,
    initiative: row.initiative ?? null,
    hitDice: row.hit_dice || '',
    proficiencyBonus: row.proficiency_bonus ?? 2,
    savingThrows: row.saving_throws || {},
    skills: row.skills || {},
    equipment: row.equipment || [],
    spells: row.spells || [],
    abilities: row.abilities || [],
    features: row.features || [],
    languages: row.languages || [],
    personalityTraits: row.personality_traits || '',
    ideals: row.ideals || '',
    bonds: row.bonds || '',
    flaws: row.flaws || '',
    backstory: row.backstory || '',
    notes: row.notes || '',
    imageUrl: row.image_url || null,
    color: row.color || '#cfaa68',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function characterToRow(ch, campaignId) {
  return {
    campaign_id: campaignId,
    name: ch.name || 'Unnamed Character',
    race: ch.race || '',
    class: ch.class || '',
    subclass: ch.subclass || '',
    level: Number(ch.level) || 1,
    background: ch.background || '',
    alignment: ch.alignment || '',
    stats: ch.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: Number(ch.hp) || 0,
    max_hp: Number(ch.maxHp) || 0,
    ac: Number(ch.ac) || 10,
    speed: Number(ch.speed) || 30,
    initiative: ch.initiative ?? null,
    hit_dice: ch.hitDice || '',
    proficiency_bonus: Number(ch.proficiencyBonus) || 2,
    saving_throws: ch.savingThrows || {},
    skills: ch.skills || {},
    equipment: Array.isArray(ch.equipment) ? ch.equipment : [],
    spells: Array.isArray(ch.spells) ? ch.spells : [],
    abilities: Array.isArray(ch.abilities) ? ch.abilities : [],
    features: Array.isArray(ch.features) ? ch.features : [],
    languages: Array.isArray(ch.languages) ? ch.languages : [],
    personality_traits: ch.personalityTraits || '',
    ideals: ch.ideals || '',
    bonds: ch.bonds || '',
    flaws: ch.flaws || '',
    backstory: ch.backstory || '',
    notes: ch.notes || '',
    image_url: ch.imageUrl || null,
    color: ch.color || '#cfaa68',
  };
}

function rowToCampaign(row, characters = []) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    ownerName: row.owner_name || 'Unknown',
    sessionNotes: Array.isArray(row.session_notes) ? row.session_notes : [],
    lastUsed: row.last_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    characters,
  };
}

async function fetchCampaignWithChars(campaignId, ownerId) {
  const { data: campaign, error: cErr } = await db()
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('owner_id', ownerId)
    .single();
  throwIfError(cErr, 'campaign fetch');
  if (!campaign) return null;

  const { data: chars, error: chErr } = await db()
    .from('campaign_characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at');
  throwIfError(chErr, 'characters fetch');

  return rowToCampaign(campaign, (chars || []).map(rowToCharacter));
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /campaigns/me — get current user's campaigns with characters
router.get('/me', authRequired, async (req, res) => {
  try {
    const { data: campaigns, error } = await db()
      .from('campaigns')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('last_used', { ascending: false });
    throwIfError(error, 'campaigns/me fetch');

    const results = await Promise.all(
      (campaigns || []).map(async (c) => {
        const { data: chars, error: chErr } = await db()
          .from('campaign_characters')
          .select('*')
          .eq('campaign_id', c.id)
          .order('created_at');
        throwIfError(chErr, 'campaigns/me chars');
        return rowToCampaign(c, (chars || []).map(rowToCharacter));
      })
    );

    return res.json({ campaigns: results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load campaigns.' });
  }
});

// GET /campaigns/:id — single campaign
router.get('/:id', authRequired, async (req, res) => {
  try {
    const campaign = await fetchCampaignWithChars(req.params.id, req.user.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    return res.json({ campaign });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load campaign.' });
  }
});

// POST /campaigns — create a new campaign
router.post('/', authRequired, editorRequired, async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Campaign name is required.' });

  try {
    const { data, error } = await db()
      .from('campaigns')
      .insert({
        name: name.trim(),
        description: (description || '').trim(),
        owner_id: req.user.id,
        owner_name: req.user.name || req.user.email || 'Unknown',
      })
      .select()
      .single();
    throwIfError(error, 'campaign create');
    return res.status(201).json({ campaign: rowToCampaign(data, []) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create campaign.' });
  }
});

// PATCH /campaigns/:id — update campaign name/description/sessionNotes
router.patch('/:id', authRequired, editorRequired, async (req, res) => {
  const { id } = req.params;
  const { name, description, sessionNotes } = req.body;

  try {
    // Verify ownership
    const { data: existing, error: fetchErr } = await db()
      .from('campaigns')
      .select('owner_id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Campaign not found.' });
    throwIfError(fetchErr, 'campaign PATCH fetch');
    if (existing.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign.' });

    const patchRow = {
      last_used: new Date().toISOString(),
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(sessionNotes !== undefined && { session_notes: sessionNotes }),
    };
    const { data, error } = await db()
      .from('campaigns')
      .update(patchRow)
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'campaign PATCH update');

    const campaign = await fetchCampaignWithChars(id, req.user.id);
    return res.json({ campaign: campaign || rowToCampaign(data, []) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update campaign.' });
  }
});

// POST /campaigns/:id/characters — add a character
router.post('/:id/characters', authRequired, editorRequired, async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const { data: campaign, error: fetchErr } = await db()
      .from('campaigns')
      .select('owner_id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Campaign not found.' });
    throwIfError(fetchErr, 'add char fetch campaign');
    if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign.' });

    const row = characterToRow(req.body, id);
    const { data, error } = await db()
      .from('campaign_characters')
      .insert(row)
      .select()
      .single();
    throwIfError(error, 'add char insert');

    // Update campaign last_used
    await db().from('campaigns').update({ last_used: new Date().toISOString() }).eq('id', id);

    return res.status(201).json({ character: rowToCharacter(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to add character.' });
  }
});

// PATCH /campaigns/:id/characters/:charId — update character sheet
router.patch('/:id/characters/:charId', authRequired, editorRequired, async (req, res) => {
  const { id, charId } = req.params;

  try {
    // Verify campaign ownership
    const { data: campaign, error: fetchErr } = await db()
      .from('campaigns')
      .select('owner_id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Campaign not found.' });
    throwIfError(fetchErr, 'update char fetch campaign');
    if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign.' });

    // Fetch existing character
    const { data: existing, error: charFetchErr } = await db()
      .from('campaign_characters')
      .select('*')
      .eq('id', charId)
      .eq('campaign_id', id)
      .single();
    if (charFetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Character not found.' });
    throwIfError(charFetchErr, 'update char fetch char');

    // Merge incoming over existing, convert to row
    const merged = { ...rowToCharacter(existing), ...req.body };
    const updateRow = characterToRow(merged, id);
    delete updateRow.campaign_id; // don't update campaign_id

    const { data, error } = await db()
      .from('campaign_characters')
      .update(updateRow)
      .eq('id', charId)
      .select()
      .single();
    throwIfError(error, 'update char update');

    await db().from('campaigns').update({ last_used: new Date().toISOString() }).eq('id', id);

    return res.json({ character: rowToCharacter(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update character.' });
  }
});

// DELETE /campaigns/:id — delete a campaign and all its characters (cascade)
router.delete('/:id', authRequired, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: campaign, error: fetchErr } = await db()
      .from('campaigns')
      .select('owner_id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Campaign not found.' });
    throwIfError(fetchErr, 'delete campaign fetch');
    if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign.' });

    const { error } = await db().from('campaigns').delete().eq('id', id);
    throwIfError(error, 'delete campaign');
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete campaign.' });
  }
});

// DELETE /campaigns/:id/characters/:charId — remove a character
router.delete('/:id/characters/:charId', authRequired, async (req, res) => {
  const { id, charId } = req.params;

  try {
    const { data: campaign, error: fetchErr } = await db()
      .from('campaigns')
      .select('owner_id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Campaign not found.' });
    throwIfError(fetchErr, 'delete char fetch campaign');
    if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your campaign.' });

    const { error } = await db()
      .from('campaign_characters')
      .delete()
      .eq('id', charId)
      .eq('campaign_id', id);
    throwIfError(error, 'delete char');

    await db().from('campaigns').update({ last_used: new Date().toISOString() }).eq('id', id);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete character.' });
  }
});

export default router;
