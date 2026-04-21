/**
 * entities.js — API for NPCs (and future entity types).
 *
 * After migration to Supabase the "npcs" entity type hits the `npcs` table.
 * The "players" and "majors" types are not yet in the DB schema; they fall
 * through to a 400 response, same as an unknown type did before.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { adminRequired, authRequired, editorRequired, resolveRequestUser } from './utils.js';
import { db, throwIfError } from './db.js';
import { sanitizeSecretItems } from './secretAccess.js';

const router = Router();

// Only "npcs" is backed by Supabase; other types are not yet migrated
const SUPABASE_TYPES = new Set(['npcs']);

// ── DB helpers ────────────────────────────────────────────────────────────────

function rowToNpc(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type || 'Unknown',
    campaign: row.campaign || 'Main',
    regionId: row.region_id || null,
    markerId: row.marker_id || null,
    locationId: row.location_id || null,
    secretId: row.secret_id || null,
    image: row.image || '',
    visible: row.visible ?? true,
    role: row.role || 'NPC',
    blurb: row.blurb || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
  };
}

function npcToRow(payload, actor) {
  return {
    name: payload.name || 'Untitled',
    description: payload.description || '',
    type: payload.entityType || payload.type || 'Unknown',
    campaign: payload.campaign || 'Main',
    region_id: payload.regionId || null,
    marker_id: payload.markerId || null,
    location_id: payload.locationId || null,
    secret_id: payload.secretId || null,
    image: payload.image || '',
    visible: payload.visible !== false,
    role: payload.role || 'NPC',
    blurb: payload.blurb || '',
    updated_by: actor || null,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/entities/:type
router.get('/:type', async (req, res) => {
  const { type } = req.params;

  if (!SUPABASE_TYPES.has(type)) {
    return res.status(400).json({ error: `Unknown entity type: ${type}` });
  }

  try {
    const viewer = await resolveRequestUser(req);
    const isAdmin = viewer?.role === 'admin';
    const { data, error } = await db().from('npcs').select('*').order('created_at');
    throwIfError(error, `entities GET /${type}`);

    const items = (data || []).map(rowToNpc);
    const visible = isAdmin ? items : items.filter((item) => item.visible !== false);
    return res.json({ items: sanitizeSecretItems(visible, viewer) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load entities.' });
  }
});

// POST /api/entities/:type/save — upsert a single entity
router.post('/:type/save', authRequired, editorRequired, async (req, res) => {
  const { type } = req.params;
  if (!SUPABASE_TYPES.has(type)) {
    return res.status(400).json({ error: `Unknown entity type: ${type}` });
  }

  const actor = req.user?.username || req.user?.name || 'unknown';
  const payload = req.body || {};

  try {
    if (payload.secretId !== undefined && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can assign secrets.' });
    }
    if (payload.visible !== undefined && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change NPC visibility.' });
    }
    if (payload.id) {
      // Update existing
      const row = {
        ...npcToRow(payload, actor),
        id: payload.id,
      };
      const { data: existing, error: fetchErr } = await db()
        .from('npcs')
        .select('created_by, created_at')
        .eq('id', payload.id)
        .maybeSingle();
      throwIfError(fetchErr, 'entities save fetch');

      if (existing) {
        row.created_by = existing.created_by || actor;
        const { data, error } = await db()
          .from('npcs')
          .update(row)
          .eq('id', payload.id)
          .select()
          .single();
        throwIfError(error, 'entities save update');
        const updated = rowToNpc(data);
        const { data: allData, error: allErr } = await db().from('npcs').select('*').order('created_at');
        throwIfError(allErr, 'entities save fetch all');
        const allItems = (allData || []).map(rowToNpc);
        const visibleItems =
          req.user?.role === 'admin'
            ? allItems
            : allItems.filter((item) => item.visible !== false);
        return res.json({
          item: sanitizeSecretItems([updated], req.user)[0] || null,
          items: sanitizeSecretItems(visibleItems, req.user),
        });
      }
    }

    // Insert new
    const row = {
      ...npcToRow(payload, actor),
      id: payload.id || randomUUID(),
      created_by: actor,
    };
    const { data, error } = await db().from('npcs').insert(row).select().single();
    throwIfError(error, 'entities save insert');
    const inserted = rowToNpc(data);
    const { data: allData, error: allErr } = await db().from('npcs').select('*').order('created_at');
    throwIfError(allErr, 'entities save fetch all');
    const allItems = (allData || []).map(rowToNpc);
    const visibleItems =
      req.user?.role === 'admin'
        ? allItems
        : allItems.filter((item) => item.visible !== false);
    return res.json({
      item: sanitizeSecretItems([inserted], req.user)[0] || null,
      items: sanitizeSecretItems(visibleItems, req.user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save entity.' });
  }
});

// POST /api/entities/:type/visibility — toggle visibility (admin)
router.post('/:type/visibility', authRequired, adminRequired, async (req, res) => {
  const { type } = req.params;
  if (!SUPABASE_TYPES.has(type)) {
    return res.status(400).json({ error: `Unknown entity type: ${type}` });
  }

  const { id, visible } = req.body || {};
  try {
    const { data, error } = await db()
      .from('npcs')
      .update({ visible: !!visible })
      .eq('id', id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Not found.' });
    throwIfError(error, 'entities visibility');
    return res.json({ item: rowToNpc(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update visibility.' });
  }
});

// PATCH /api/entities/:type/:id
router.patch('/:type/:id', authRequired, editorRequired, async (req, res) => {
  const { type, id } = req.params;
  if (!SUPABASE_TYPES.has(type)) {
    return res.status(400).json({ error: `Unknown entity type: ${type}` });
  }

  const actor = req.user?.username || req.user?.name || 'unknown';
  try {
    if (req.body?.secretId !== undefined && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can assign secrets.' });
    }
    if (req.body?.visible !== undefined && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change NPC visibility.' });
    }
    const { data: existing, error: fetchErr } = await db()
      .from('npcs')
      .select('created_by, created_at')
      .eq('id', id)
      .maybeSingle();
    throwIfError(fetchErr, 'entities PATCH fetch');
    if (!existing) return res.status(404).json({ error: 'Not found.' });

    const row = {
      ...npcToRow({ ...req.body }, actor),
      created_by: existing.created_by || actor,
    };
    const { data, error } = await db()
      .from('npcs')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'entities PATCH update');
    const updated = rowToNpc(data);
    return res.json({ item: sanitizeSecretItems([updated], req.user)[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update entity.' });
  }
});

// DELETE /api/entities/:type/:id — admin only
router.delete('/:type/:id', authRequired, adminRequired, async (req, res) => {
  const { type, id } = req.params;
  if (!SUPABASE_TYPES.has(type)) {
    return res.status(400).json({ error: `Unknown entity type: ${type}` });
  }

  try {
    const { error } = await db().from('npcs').delete().eq('id', id);
    throwIfError(error, 'entities DELETE');
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete entity.' });
  }
});

export default router;
