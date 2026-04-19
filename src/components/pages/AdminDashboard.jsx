import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiGet, apiPost, apiDel } from '../../utils/apiClient';

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'editor',  label: 'Editor'  },
  { value: 'admin',   label: 'Admin'   },
];

const ROLE_STYLES = {
  admin:   { background: 'rgba(207,170,104,0.18)', color: '#cfaa68', border: '1px solid rgba(207,170,104,0.4)' },
  editor:  { background: 'rgba(76,175,110,0.15)',  color: '#4caf6e', border: '1px solid rgba(76,175,110,0.35)' },
  pending: { background: 'rgba(255,255,255,0.06)', color: '#a09080', border: '1px solid rgba(255,255,255,0.12)' },
  guest:   { background: 'rgba(255,255,255,0.04)', color: '#6e6054', border: '1px solid rgba(255,255,255,0.08)' },
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.guest;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, ...style }}>
      {role}
    </span>
  );
}

function Btn({ children, onClick, disabled, variant = 'default', style: extraStyle = {} }) {
  const base = {
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s, background 0.15s',
    ...extraStyle,
  };
  const variants = {
    default:  { background: 'rgba(255,255,255,0.07)', color: '#c8bfaf' },
    approve:  { background: 'rgba(76,175,110,0.2)',   color: '#4caf6e' },
    gold:     { background: 'rgba(207,170,104,0.2)',   color: '#cfaa68' },
    danger:   { background: 'rgba(224,82,82,0.15)',    color: '#e05252' },
    primary:  { background: 'rgba(207,170,104,0.9)',   color: '#1a1209', fontWeight: 700 },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#1a1510', border: '1px solid rgba(207,170,104,0.25)', borderRadius: '12px',
        padding: '2rem', minWidth: 360, maxWidth: 480, width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontFamily: 'Cinzel, serif', color: 'var(--azterra-gold, #cfaa68)', fontSize: '1rem' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a7a6a', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, id, ...props }) {
  return (
    <label htmlFor={id} style={{ display: 'block', marginBottom: '0.75rem', color: '#c8bfaf', fontSize: '0.9rem' }}>
      <span style={{ display: 'block', marginBottom: '4px' }}>{label}</span>
      <input
        id={id}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '6px', padding: '8px 10px', color: '#e8ddc8', fontSize: '0.9rem',
          outline: 'none', boxSizing: 'border-box',
        }}
        {...props}
      />
    </label>
  );
}

// ── Section: Pending approval ─────────────────────────────────────────────────

function PendingSection({ users, updatingId, onApprove, onApproveAdmin }) {
  if (users.length === 0) return null;
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', color: 'var(--azterra-gold, #cfaa68)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ background: '#e05252', color: '#fff', borderRadius: '999px', padding: '1px 8px', fontSize: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
          {users.length}
        </span>
        Awaiting Approval
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {users.map((u) => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(224,82,82,0.25)',
            borderRadius: '8px', padding: '0.75rem 1rem', gap: '1rem', flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--azterra-ink, #e8ddc8)', marginBottom: '2px' }}>{u.name || 'Unnamed'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--azterra-ink-dim, #8a7a6a)' }}>{u.email}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Btn variant="approve" disabled={updatingId === u.id} onClick={() => onApprove(u.id)}>
                ✓ Approve as Editor
              </Btn>
              <Btn variant="gold" disabled={updatingId === u.id} onClick={() => onApproveAdmin(u.id)}>
                Approve as Admin
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Set Password modal ────────────────────────────────────────────────────────

function SetPasswordModal({ user: targetUser, onClose, onSuccess }) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await apiPost(`/admin/users/${targetUser.id}/set-password`, { password });
      toast.success(`Password set for ${targetUser.name || targetUser.email}.`);
      onSuccess?.();
      onClose();
    } catch (error) {
      setErr(error.message || 'Unable to set password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Set Password — ${targetUser.name || targetUser.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="New Password" id="sp-pw" type="password" placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <FormField label="Confirm Password" id="sp-pw2" type="password" placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {err && <p style={{ color: '#e05252', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{err}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Set Password'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Create User modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSuccess }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ email: '', name: '', username: '', password: '', role: 'pending' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.email || !form.password) { setErr('Email and password are required.'); return; }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      await apiPost('/admin/users/create', form);
      toast.success(`Account created for ${form.email}.`);
      onSuccess?.();
      onClose();
    } catch (error) {
      setErr(error.message || 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Create Local Account" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Email *" id="cu-email" type="email" placeholder="user@example.com" value={form.email} onChange={set('email')} required />
        <FormField label="Password * (min. 8 chars)" id="cu-pw" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
        <FormField label="Display Name" id="cu-name" type="text" placeholder="Full name" value={form.name} onChange={set('name')} />
        <FormField label="Username" id="cu-username" type="text" placeholder="Display username" value={form.username} onChange={set('username')} />
        <label style={{ display: 'block', marginBottom: '0.75rem', color: '#c8bfaf', fontSize: '0.9rem' }}>
          <span style={{ display: 'block', marginBottom: '4px' }}>Role</span>
          <select value={form.role} onChange={set('role')} style={{
            width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px', padding: '8px 10px', color: '#e8ddc8', fontSize: '0.9rem', outline: 'none',
          }}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {err && <p style={{ color: '#e05252', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{err}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Account'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteUserModal({ user: targetUser, onClose, onSuccess }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiDel(`/admin/users/${targetUser.id}`);
      toast.success(`Deleted account for ${targetUser.name || targetUser.email}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not delete user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Delete Account?" onClose={onClose}>
      <p style={{ color: '#c8bfaf', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Are you sure you want to permanently delete <strong style={{ color: '#e8ddc8' }}>{targetUser.name || targetUser.email}</strong>? This cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete Account'}
        </Btn>
      </div>
    </Modal>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

function AdminDashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();

  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Modals
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [deleteTarget, setDeleteTarget]     = useState(null);
  const [showCreate, setShowCreate]         = useState(false);

  const isAdmin = role === 'admin';

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/admin/users');
      const ORDER = { pending: 0, editor: 1, admin: 2, guest: 3 };
      const sorted = [...(data.users || [])].sort((a, b) => (ORDER[a.role] ?? 9) - (ORDER[b.role] ?? 9));
      setUsers(sorted);
    } catch (err) {
      toast.error(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user) loadUsers();
    else setLoading(false);
  }, [isAdmin, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRole = async (targetUserId, newRole) => {
    if (!user || updatingId) return;
    setUpdatingId(targetUserId);
    try {
      const data = await apiPost('/admin/updateRole', { userId: targetUserId, newRole });
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? { ...u, role: data.user.role } : u)));
      toast.success(`Role updated to "${newRole}".`);
    } catch (err) {
      toast.error(err.message || 'Could not update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="page-container">
        <h1 style={{ fontFamily: 'Cinzel, serif', color: 'var(--azterra-gold, #cfaa68)' }}>Admin Dashboard</h1>
        <p style={{ color: 'var(--azterra-ink-dim, #8a7a6a)' }}>You must be an admin to view this page.</p>
      </div>
    );
  }

  const pendingUsers = users.filter((u) => u.role === 'pending');
  const otherUsers   = users.filter((u) => u.role !== 'pending');

  return (
    <div className="page-container" style={{ maxWidth: 1000 }}>
      {/* Modals */}
      {passwordTarget && (
        <SetPasswordModal user={passwordTarget} onClose={() => setPasswordTarget(null)} onSuccess={loadUsers} />
      )}
      {deleteTarget && (
        <DeleteUserModal user={deleteTarget} onClose={() => setDeleteTarget(null)} onSuccess={loadUsers} />
      )}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onSuccess={loadUsers} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Cinzel, serif', color: 'var(--azterra-gold, #cfaa68)', margin: '0 0 0.25rem' }}>
            Admin Dashboard
          </h1>
          <p style={{ color: 'var(--azterra-ink-dim, #8a7a6a)', margin: 0, fontSize: '0.9rem' }}>
            Manage user access to the Azterra world.
          </p>
        </div>
        <Btn variant="gold" onClick={() => setShowCreate(true)}>
          + Create Account
        </Btn>
      </div>

      {loading ? (
        <p style={{ color: 'var(--azterra-ink-dim, #8a7a6a)' }}>Loading users…</p>
      ) : (
        <>
          {/* Pending approval section */}
          <PendingSection
            users={pendingUsers}
            updatingId={updatingId}
            onApprove={(id) => updateRole(id, 'editor')}
            onApproveAdmin={(id) => updateRole(id, 'admin')}
          />

          {/* All users table */}
          <section>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', color: 'var(--azterra-ink-dim, #8a7a6a)', marginBottom: '1rem' }}>
              All Users ({users.length})
            </h2>

            {users.length === 0 ? (
              <p style={{ color: 'var(--azterra-ink-dim, #8a7a6a)' }}>No users yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                      {['Name', 'Email', 'Role', 'Provider', 'Joined', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', color: 'var(--azterra-ink-dim, #8a7a6a)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: u.role === 'pending' ? 'rgba(224,82,82,0.04)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 12px', color: 'var(--azterra-ink, #e8ddc8)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {u.name || '—'}
                          {u.id === user?.id && (
                            <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#cfaa68', opacity: 0.7 }}>(you)</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--azterra-ink-dim, #8a7a6a)', fontSize: '0.82rem' }}>
                          {u.email}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <RoleBadge role={u.role} />
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--azterra-ink-dim, #8a7a6a)', fontSize: '0.8rem' }}>
                          {u.provider || 'supabase'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--azterra-ink-dim, #8a7a6a)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Role buttons */}
                            {ROLE_OPTIONS.map((opt) => (
                              <Btn
                                key={opt.value}
                                variant={u.role === opt.value ? 'gold' : 'default'}
                                onClick={() => updateRole(u.id, opt.value)}
                                disabled={
                                  updatingId === u.id ||
                                  u.role === opt.value ||
                                  (u.id === user?.id && opt.value !== 'admin')
                                }
                              >
                                {opt.label}
                              </Btn>
                            ))}
                            {/* Set password */}
                            <Btn variant="default" onClick={() => setPasswordTarget(u)} disabled={updatingId === u.id}>
                              🔑 Password
                            </Btn>
                            {/* Delete */}
                            {u.id !== user?.id && (
                              <Btn variant="danger" onClick={() => setDeleteTarget(u)} disabled={updatingId === u.id}>
                                🗑 Delete
                              </Btn>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
