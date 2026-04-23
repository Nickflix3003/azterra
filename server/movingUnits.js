import express from 'express';
import { randomUUID } from 'node:crypto';
import { authRequired, editorRequired } from './utils.js';
import { normalizeMovingUnit, readMovingUnits, writeMovingUnits } from './movingUnitStore.js';

const router = express.Router();

router.get('/', async function(req, res) {
  try {
    const units = await readMovingUnits();
    return res.json({ units });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load moving units.' });
  }
});

router.post('/', authRequired, editorRequired, async function(req, res) {
  try {
    const actor = (req.user && (req.user.username || req.user.name)) || 'unknown';
    const units = await readMovingUnits();
    const nextUnit = normalizeMovingUnit({
      ...req.body,
      id: req.body?.id || randomUUID(),
      createdBy: actor,
      updatedBy: actor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const nextUnits = [...units.filter((unit) => String(unit.id) !== String(nextUnit.id)), nextUnit];
    await writeMovingUnits(nextUnits);
    return res.status(201).json({ unit: nextUnit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create moving unit.' });
  }
});

router.patch('/:id', authRequired, editorRequired, async function(req, res) {
  const { id } = req.params;
  try {
    const actor = (req.user && (req.user.username || req.user.name)) || 'unknown';
    const units = await readMovingUnits();
    const existing = units.find((unit) => String(unit.id) === String(id));
    if (!existing) {
      return res.status(404).json({ error: 'Moving unit not found.' });
    }

    const nextUnit = normalizeMovingUnit({
      ...existing,
      ...req.body,
      id: existing.id,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    });
    const nextUnits = units.map((unit) => (String(unit.id) === String(id) ? nextUnit : unit));
    await writeMovingUnits(nextUnits);
    return res.json({ unit: nextUnit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update moving unit.' });
  }
});

router.delete('/:id', authRequired, editorRequired, async function(req, res) {
  const { id } = req.params;
  try {
    const units = await readMovingUnits();
    const exists = units.some((unit) => String(unit.id) === String(id));
    if (!exists) {
      return res.status(404).json({ error: 'Moving unit not found.' });
    }
    const nextUnits = units.filter((unit) => String(unit.id) !== String(id));
    await writeMovingUnits(nextUnits);
    return res.json({ success: true, id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete moving unit.' });
  }
});

export default router;
