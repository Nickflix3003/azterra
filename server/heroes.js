import { Router } from 'express';
import { adminRequired, authRequired, editorRequired } from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();

// ── DB helpers ────────────────────────────────────────────────────────────────

function rowToHero(row) {
  return {
    id: row.id,
    name: row.name,
    title: row.title || '',
    race: row.race || '',
    class: row.class || '',
    subclass: row.subclass || '',
    level: row.level ?? 1,
    alignment: row.alignment || '',
    background: row.background || '',
    hp: row.hp ?? 0,
    ac: row.ac ?? 10,
    speed: row.speed ?? 30,
    stats: row.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    passivePerception: row.passive_perception ?? 10,
    inspiration: row.inspiration ?? false,
    profBonus: row.prof_bonus ?? 2,
    skills: row.skills || [],
    abilities: row.abilities || [],
    spells: row.spells || [],
    equipment: row.equipment || [],
    notes: row.notes || '',
    lore: row.lore || '',
    color: row.color || '#cfaa68',
    sheet: row.sheet || {},
    visible: row.visible ?? true,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
  };
}

function heroToRow(h, actor) {
  return {
    ...(h.id !== undefined && { id: String(h.id) }),
    name: h.name || 'Unnamed',
    title: h.title || '',
    race: h.race || '',
    class: h.class || '',
    subclass: h.subclass || '',
    level: Number(h.level) || 1,
    alignment: h.alignment || '',
    background: h.background || '',
    hp: Number(h.hp) || 0,
    ac: Number(h.ac) || 10,
    speed: Number(h.speed) || 30,
    stats: h.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    passive_perception: h.passivePerception ?? 10,
    inspiration: h.inspiration ?? false,
    prof_bonus: h.profBonus ?? 2,
    skills: Array.isArray(h.skills) ? h.skills : [],
    abilities: Array.isArray(h.abilities) ? h.abilities : [],
    spells: Array.isArray(h.spells) ? h.spells : [],
    equipment: Array.isArray(h.equipment) ? h.equipment : [],
    notes: h.notes || '',
    lore: h.lore || '',
    color: h.color || '#cfaa68',
    sheet: h.sheet || {},
    visible: h.visible !== false,
    sort_order: h.sortOrder ?? 0,
    updated_by: actor || null,
  };
}

const EDITABLE_FIELDS = new Set([
  'name', 'title', 'player', 'race', 'class', 'subclass', 'alignment',
  'level', 'hp', 'ac', 'speed', 'notes', 'lore', 'profilePicture',
  'stats', 'skills', 'abilities', 'spells', 'equipment', 'sheet',
  'passivePerception', 'inspiration', 'profBonus', 'background',
]);

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/heroes — public; returns all visible heroes
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await db()
      .from('heroes')
      .select('*')
      .eq('visible', true)
      .order('sort_order', { ascending: true });
    throwIfError(error, 'heroes GET /');
    return res.json({ heroes: (data || []).map(rowToHero) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load heroes.' });
  }
});

// GET /api/heroes/:id — public; single hero by id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db()
      .from('heroes')
      .select('*')
      .eq('id', String(req.params.id))
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Hero not found.' });
    throwIfError(error, 'heroes GET /:id');
    return res.json({ hero: rowToHero(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load hero.' });
  }
});

// PATCH /api/heroes/:id — editor+; update mutable fields
router.patch('/:id', authRequired, editorRequired, async (req, res) => {
  const id = String(req.params.id);
  const actor = req.user?.username || req.user?.name || 'unknown';

  try {
    const { data: existing, error: fetchErr } = await db()
      .from('heroes')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Hero not found.' });
    throwIfError(fetchErr, 'heroes PATCH fetch');

    const updates = req.body || {};
    const patchRow = {};
    for (const [key, val] of Object.entries(updates)) {
      if (EDITABLE_FIELDS.has(key)) {
        // Map camelCase → snake_case for DB
        const dbKey = {
          passivePerception: 'passive_perception',
          profBonus: 'prof_bonus',
          profilePicture: 'profile_picture',
        }[key] || key;
        patchRow[dbKey] = val;
      }
    }
    patchRow.updated_by = actor;
    if (!existing.created_by) patchRow.created_by = actor;

    const { data, error } = await db()
      .from('heroes')
      .update(patchRow)
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'heroes PATCH update');
    return res.json({ hero: rowToHero(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update hero.' });
  }
});

// POST /api/heroes — admin only; add a new hero
router.post('/', authRequired, adminRequired, async (req, res) => {
  const actor = req.user?.username || req.user?.name || 'unknown';
  try {
    const row = heroToRow(req.body, actor);
    row.created_by = actor;
    // Remove id so DB generates one
    delete row.id;

    const { data, error } = await db()
      .from('heroes')
      .insert(row)
      .select()
      .single();
    throwIfError(error, 'heroes POST insert');
    return res.status(201).json({ hero: rowToHero(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create hero.' });
  }
});

// DELETE /api/heroes/:id — admin only
router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { error } = await db()
      .from('heroes')
      .delete()
      .eq('id', String(req.params.id));
    throwIfError(error, 'heroes DELETE');
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete hero.' });
  }
});

export default router;
