import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { EmptyState, Spinner } from '../components/ui/EmptyState';
import type { SiteProfile } from '../types';
import { Plus, Pencil, Trash2, CheckCircle2, Building2 } from 'lucide-react';

const blankProfile: Omit<SiteProfile, 'id'> = {
  name: '', display_name: '', base_url: '', site_name: '', is_active: false, notes: '',
};

export default function Settings() {
  const [profiles, setProfiles] = useState<SiteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SiteProfile | null>(null);
  const [form, setForm] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('site_profiles').select('*').order('created_at');
    setProfiles(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(blankProfile); setModalOpen(true); };
  const openEdit = (p: SiteProfile) => { setEditing(p); setForm(p); setModalOpen(true); };

  const save = async () => {
    setSaving(true);
    if (editing?.id) {
      await supabase.from('site_profiles').update(form).eq('id', editing.id);
    } else {
      await supabase.from('site_profiles').insert(form);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('site_profiles').delete().eq('id', id);
    setDeleteId(null);
    load();
  };

  const setActive = async (id: string) => {
    await supabase.from('site_profiles').update({ is_active: false }).neq('id', id);
    await supabase.from('site_profiles').update({ is_active: true }).eq('id', id);
    load();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Site Profiles</CardTitle>
            <CardDescription>Manage Ventures API connection profiles for multiple CDFIs</CardDescription>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={14} /> Add Profile
          </button>
        </CardHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Spinner size={20} className="text-neutral-400" /></div>
        ) : profiles.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No site profiles"
            description="Add a profile for each Ventures site you want to connect to."
            action={<button onClick={openCreate} className="btn-primary">Add Profile</button>}
          />
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-4 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.display_name}</span>
                    {p.is_active && <Badge variant="green" dot>Active</Badge>}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mono truncate mt-0.5">{p.base_url} · {p.site_name}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.is_active && (
                    <button onClick={() => p.id && setActive(p.id)} className="btn-ghost text-xs">
                      <CheckCircle2 size={13} /> Set Active
                    </button>
                  )}
                  <button onClick={() => openEdit(p)} className="btn-ghost"><Pencil size={13} /></button>
                  <button onClick={() => setDeleteId(p.id || null)} className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="md">
        <CardTitle>Environment Variables</CardTitle>
        <CardDescription className="mt-1 mb-4">Required in your .env file for each site profile</CardDescription>
        <div className="space-y-1.5">
          {[
            ['VITE_VENTURES_BASE_URL', 'https://ventures.example.com'],
            ['VITE_VENTURES_SITE', 'your-site'],
            ['VITE_VENTURES_USERNAME', 'api@example.com'],
            ['VITE_VENTURES_PASSWORD', '••••••••'],
          ].map(([key, val]) => (
            <div key={key} className="flex items-center gap-3 p-2 rounded bg-neutral-50 dark:bg-neutral-800">
              <code className="mono text-primary-600 dark:text-primary-400 text-xs">{key}</code>
              <span className="text-neutral-400 text-xs ml-auto">{val}</span>
            </div>
          ))}
        </div>
        <Alert variant="info" className="mt-4">
          Never commit credentials to source control. Use a secure secrets manager in production.
        </Alert>
      </Card>

      {/* Edit/Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Profile' : 'New Site Profile'}>
        <div className="space-y-4">
          {[
            { field: 'display_name', label: 'Display Name', placeholder: 'Your Organization' },
            { field: 'name',         label: 'Profile Key',   placeholder: 'your-site' },
            { field: 'base_url',     label: 'Base URL',      placeholder: 'https://ventures.example.com' },
            { field: 'site_name',    label: 'Site Name',     placeholder: 'your-site' },
            { field: 'notes',        label: 'Notes',         placeholder: 'Optional notes about this profile' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">{label}</label>
              <input
                className="input"
                placeholder={placeholder}
                value={(form as unknown as Record<string, string>)[field] || ''}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving || !form.display_name || !form.base_url} className="btn-primary">
              {saving ? <Spinner size={14} /> : null} Save Profile
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Profile" width="sm">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">Are you sure you want to delete this profile?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => deleteId && remove(deleteId)} className="btn-danger">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
