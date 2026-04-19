import { Router } from 'express';
import { authRequired } from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhrase(phrase = '') {
  return phrase.trim().toLowerCase();
}

function buildPhraseMap(secrets = []) {
  return secrets.reduce((acc, secret) => {
    if (secret.keyword) acc[normalizePhrase(secret.keyword)] = secret.id;
    return acc;
  }, {});
}

async function readSecrets() {
  const { data, error } = await db().from('secrets').select('*');
  throwIfError(error, 'secrets read');
  return data || [];
}

async function getUnlockedIds(userId) {
  const { data, error } = await db()
    .from('profiles')
    .select('unlocked_secrets')
    .eq('id', userId)
    .single();
  if (error || !data) return [];
  return Array.isArray(data.unlocked_secrets) ? data.unlocked_secrets : [];
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/secrets/progress — return which secrets the user has unlocked
router.get('/progress', authRequired, async (req, res) => {
  try {
    const secrets = await readSecrets();
    const isAdmin = req.user?.role === 'admin';
    const unlocked = await getUnlockedIds(req.user.id);
    const unlockedList = isAdmin ? secrets.map((s) => s.id) : unlocked;
    const details = isAdmin ? secrets : secrets.filter((s) => unlocked.includes(s.id));
    return res.json({ unlocked: unlockedList, details, user: req.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load secrets.' });
  }
});

// POST /api/secrets/unlock — unlock a secret by phrase
router.post('/unlock', authRequired, async (req, res) => {
  try {
    const secrets = await readSecrets();
    const phraseMap = buildPhraseMap(secrets);
    const { phrase = '' } = req.body || {};
    const normalized = normalizePhrase(phrase);

    if (!normalized) return res.status(400).json({ error: 'A secret phrase is required.' });
    const secretId = phraseMap[normalized];
    if (!secretId) return res.status(404).json({ error: 'No secret matched that phrase.' });

    const currentUnlocked = await getUnlockedIds(req.user.id);
    const newlyUnlocked = !currentUnlocked.includes(secretId);
    const nextUnlocked = newlyUnlocked
      ? [...currentUnlocked, secretId]
      : currentUnlocked;

    const { error } = await db()
      .from('profiles')
      .update({ unlocked_secrets: nextUnlocked })
      .eq('id', req.user.id);
    throwIfError(error, 'secrets unlock update');

    const details = secrets.filter((s) => nextUnlocked.includes(s.id));
    return res.json({
      success: true,
      newlyUnlocked,
      unlocked: nextUnlocked,
      details,
      user: { ...req.user, unlockedSecrets: nextUnlocked },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to unlock secret.' });
  }
});

// PUT /api/secrets/:id — admin only; update a secret's fields
router.put('/:id', authRequired, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const { id } = req.params;
  const { title = '', description = '', keyword = '' } = req.body || {};

  try {
    const { data: existing, error: fetchErr } = await db()
      .from('secrets')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Secret not found.' });
    throwIfError(fetchErr, 'secrets PUT fetch');

    const patchRow = {
      title: title.trim() || existing.title,
      description: description.trim() || existing.description,
      keyword: keyword.trim(),
    };
    const { data, error } = await db()
      .from('secrets')
      .update(patchRow)
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'secrets PUT update');
    return res.json({ secret: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update secret.' });
  }
});

export default router;
