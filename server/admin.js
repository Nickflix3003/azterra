import { Router } from 'express';
import {
  ALLOWED_ROLES,
  adminRequired,
  authRequired,
  hashPassword,
  IMMUTABLE_ADMIN_EMAIL,
  isImmutableAdminEmail,
  readUsers,
  sanitizeUser,
  updateUsers,
  profileToUser,
} from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();

router.use(authRequired);
router.use(adminRequired);

// Helper: is this id a Supabase UUID?
const isUUID = (id) => /^[0-9a-f-]{36}$/.test(String(id));

// ── GET /api/admin/users — list all users ────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    // Get Supabase profiles
    const { data: profiles, error } = await db().from('profiles').select('*').order('created_at');
    throwIfError(error, 'admin GET /users');

    const supabaseUsers = (profiles || []).map(profileToUser);

    // Also get local JSON accounts (admin, legacy) that aren't in Supabase
    const localUsers = await readUsers();
    const supabaseEmails = new Set(supabaseUsers.map((u) => u.email));
    const jsonOnlyUsers = localUsers
      .filter((u) => !supabaseEmails.has(u.email))
      .map(sanitizeUser);

    return res.json({ users: [...supabaseUsers, ...jsonOnlyUsers] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load users.' });
  }
});

// ── POST /api/admin/updateRole ───────────────────────────────────────────────
router.post('/updateRole', async (req, res) => {
  const { userId, newRole } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required.' });
  if (!ALLOWED_ROLES.includes(newRole)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}.` });
  }
  if (String(userId) === String(req.user.id) && newRole !== 'admin') {
    return res.status(400).json({ error: 'Admins cannot demote themselves.' });
  }

  try {
    if (isUUID(userId)) {
      const { data: existing, error: fetchError } = await db()
        .from('profiles')
        .select('*')
        .eq('id', String(userId))
        .single();
      if (fetchError?.code === 'PGRST116') return res.status(404).json({ error: 'User not found.' });
      throwIfError(fetchError, 'updateRole fetch');
      const targetEmail = existing.email || '';
      if (isImmutableAdminEmail(targetEmail) && newRole !== 'admin') {
        return res.status(400).json({ error: 'The local admin account cannot be demoted.' });
      }
      if (!isImmutableAdminEmail(targetEmail) && newRole === 'admin') {
        return res.status(400).json({ error: `Only ${IMMUTABLE_ADMIN_EMAIL} can be an admin.` });
      }
      const { data, error } = await db()
        .from('profiles')
        .update({ role: newRole })
        .eq('id', String(userId))
        .select()
        .single();
      if (error?.code === 'PGRST116') return res.status(404).json({ error: 'User not found.' });
      throwIfError(error, 'updateRole');
      return res.json({ user: profileToUser(data) });
    }

    // Legacy JSON user
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId)) return res.status(400).json({ error: 'Invalid user id.' });
    let updatedUser = null;
    await updateUsers((users) => {
      const index = users.findIndex((u) => u.id === parsedId);
      if (index === -1) throw new Error('not_found');
      if (isImmutableAdminEmail(users[index].email) && newRole !== 'admin') {
        throw new Error('immutable_admin');
      }
      if (!isImmutableAdminEmail(users[index].email) && newRole === 'admin') {
        throw new Error('admin_forbidden');
      }
      const next = [...users];
      updatedUser = { ...users[index], role: newRole };
      next[index] = updatedUser;
      return next;
    });
    return res.json({ user: sanitizeUser(updatedUser) });
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).json({ error: 'User not found.' });
    if (err.message === 'immutable_admin') return res.status(400).json({ error: 'The local admin account cannot be demoted.' });
    if (err.message === 'admin_forbidden') return res.status(400).json({ error: `Only ${IMMUTABLE_ADMIN_EMAIL} can be an admin.` });
    console.error(err);
    return res.status(500).json({ error: 'Unable to update role.' });
  }
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.user.id)) {
    return res.status(400).json({ error: 'Admins cannot delete their own account.' });
  }

  try {
    if (isUUID(id)) {
      const { data: existing, error: fetchError } = await db().from('profiles').select('email').eq('id', id).single();
      if (fetchError?.code === 'PGRST116') return res.status(404).json({ error: 'User not found.' });
      throwIfError(fetchError, 'admin delete user fetch');
      if (isImmutableAdminEmail(existing?.email)) {
        return res.status(400).json({ error: 'The local admin account cannot be deleted.' });
      }
      const { error } = await db().from('profiles').delete().eq('id', id);
      throwIfError(error, 'admin delete user');
      return res.json({ success: true });
    }

    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return res.status(400).json({ error: 'Invalid user id.' });
    let deleted = false;
    await updateUsers((users) => {
      const index = users.findIndex((u) => u.id === parsedId);
      if (index === -1) return users;
      if (isImmutableAdminEmail(users[index].email)) {
        throw new Error('immutable_admin');
      }
      const next = [...users];
      next.splice(index, 1);
      deleted = true;
      return next;
    });
    if (!deleted) return res.status(404).json({ error: 'User not found.' });
    return res.json({ success: true });
  } catch (err) {
    if (err.message === 'immutable_admin') return res.status(400).json({ error: 'The local admin account cannot be deleted.' });
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete user.' });
  }
});

// ── POST /api/admin/users/:id/approve ───────────────────────────────────────
router.post('/users/:id/approve', async (req, res) => {
  const { id } = req.params;

  try {
    if (isUUID(id)) {
      const { data: profile, error: fetchErr } = await db()
        .from('profiles')
        .select('role')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'User not found.' });
      throwIfError(fetchErr, 'approve fetch');
      if (profile.role !== 'pending') return res.status(400).json({ error: 'User is not pending approval.' });

      const { data, error } = await db()
        .from('profiles')
        .update({ role: 'editor' })
        .eq('id', id)
        .select()
        .single();
      throwIfError(error, 'approve update');
      return res.json({ user: profileToUser(data) });
    }

    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return res.status(400).json({ error: 'Invalid user id.' });
    let updatedUser = null;
    await updateUsers((users) => {
      const index = users.findIndex((u) => u.id === parsedId);
      if (index === -1) throw new Error('not_found');
      if (users[index].role !== 'pending') throw new Error('not_pending');
      const next = [...users];
      updatedUser = { ...next[index], role: 'editor' };
      next[index] = updatedUser;
      return next;
    });
    return res.json({ user: sanitizeUser(updatedUser) });
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).json({ error: 'User not found.' });
    if (err.message === 'not_pending') return res.status(400).json({ error: 'User is not pending approval.' });
    console.error(err);
    return res.status(500).json({ error: 'Unable to approve user.' });
  }
});

// ── POST /api/admin/users/:id/set-password ───────────────────────────────────
// Only works for local JSON accounts
router.post('/users/:id/set-password', async (req, res) => {
  const parsedId = Number(req.params.id);
  const { password } = req.body || {};
  if (!Number.isInteger(parsedId)) return res.status(400).json({ error: 'Invalid user id (UUID users use Supabase auth).' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const passwordHash = await hashPassword(password);
  let updatedUser = null;
  try {
    await updateUsers((users) => {
      const index = users.findIndex((u) => u.id === parsedId);
      if (index === -1) throw new Error('not_found');
      const next = [...users];
      updatedUser = { ...next[index], passwordHash };
      next[index] = updatedUser;
      return next;
    });
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).json({ error: 'User not found.' });
    return res.status(500).json({ error: 'Unable to set password.' });
  }
  return res.json({ user: sanitizeUser(updatedUser) });
});

// ── POST /api/admin/users/create ────────────────────────────────────────────
// Create a local (JSON) account. Supabase users sign up via OAuth / magic link.
router.post('/users/create', async (req, res) => {
  const { email, name, username, password, role = 'pending' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: `Invalid role.` });
  if (role === 'admin' && !isImmutableAdminEmail(email)) {
    return res.status(400).json({ error: `Only ${IMMUTABLE_ADMIN_EMAIL} can be an admin.` });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const users = await readUsers();
  if (users.find((u) => u.email === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const { addUser } = await import('./utils.js');
  const newUser = await addUser({
    email: email.toLowerCase().trim(),
    name: (name || email.split('@')[0]).trim(),
    username: (username || email.split('@')[0]).trim(),
    passwordHash,
    favorites: [],
    featuredCharacter: null,
    profilePicture: '',
    profile: { bio: '', labelOne: '', labelTwo: '', documents: [], viewFavorites: [] },
    unlockedSecrets: [],
    role,
    provider: 'local',
    createdAt: new Date().toISOString(),
  });
  return res.status(201).json({ user: sanitizeUser(newUser) });
});

export default router;
