import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { EmptyState, Spinner, PageSpinner } from '../components/ui/EmptyState';
import type { TriggerDefinition } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Pencil, Trash2, Zap, Download, Power, Mail, Users, User,
  FileText, CheckCircle2, Clock,
} from 'lucide-react';

const blank: Omit<TriggerDefinition, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  data_source: '',
  required_fields: [],
  condition_field: '',
  condition_operator: 'equals',
  condition_value: '',
  delay_minutes: 0,
  notification_type: 'email',
  escalation_rule: '',
  writeback_required: false,
  notes: '',
  enabled: false,
  workflow: 'loan_intake',
  recipient_type: 'borrower',
  email_subject: '',
  email_body: '',
  trigger_event: 'no_docs_in_x_days',
};

const OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'is_empty', 'is_not_empty'];
const NOTIFICATION_TYPES = ['email', 'teams', 'task', 'email+task', 'email+teams', 'none'];
const WORKFLOWS = [
  { value: 'loan_intake', label: 'Loan Intake Follow-Up' },
  { value: 'servicing_ticklers', label: 'Servicing Ticklers' },
];
const TRIGGER_EVENTS = [
  { value: 'no_docs_in_x_days', label: 'No Documents Uploaded in X Days' },
  { value: 'docs_uploaded', label: 'Documents Uploaded' },
  { value: 'tickler_overdue', label: 'Tickler Overdue' },
  { value: 'tickler_upcoming', label: 'Tickler Upcoming' },
  { value: 'tickler_escalation', label: 'Tickler Escalation' },
  { value: 'tickler_completion', label: 'Tickler Completion' },
];
const RECIPIENT_TYPES = [
  { value: 'borrower', label: 'Borrower / Applicant', icon: User },
  { value: 'internal', label: 'Internal Team', icon: Users },
  { value: 'bdo', label: 'Assigned BDO / Loan Officer', icon: Mail },
];
const TEMPLATE_VARIABLES = [
  '{{borrower_name}}', '{{borrower_email}}', '{{log_number}}',
  '{{loan_id}}', '{{assigned_bdo}}', '{{missing_documents}}',
  '{{uploaded_documents}}', '{{document_categories}}',
  '{{days_inactive}}', '{{threshold}}', '{{current_status}}',
  '{{tickler_name}}', '{{tickler_due_date}}', '{{tickler_owner}}',
];

const EVENT_ICONS: Record<string, React.ElementType> = {
  no_docs_in_x_days: Clock,
  docs_uploaded: FileText,
  tickler_overdue: AlertTriangle,
  tickler_upcoming: Bell,
  tickler_escalation: TrendingUp,
  tickler_completion: CheckCircle2,
};

// Need to import these since we reference them in EVENT_ICONS
import { AlertTriangle, Bell, TrendingUp } from 'lucide-react';

export default function TriggerBuilder() {
  const { config } = useAuth();
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TriggerDefinition | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [showVarHint, setShowVarHint] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('trigger_definitions').select('*').order('created_at', { ascending: false });
    setTriggers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...blank }); setFieldInput(''); setModalOpen(true); };
  const openEdit = (t: TriggerDefinition) => { setEditing(t); setForm(t); setFieldInput(''); setModalOpen(true); };

  const addField = () => {
    if (!fieldInput.trim()) return;
    setForm((f) => ({ ...f, required_fields: [...(f.required_fields || []), fieldInput.trim()] }));
    setFieldInput('');
  };

  const removeField = (i: number) => setForm((f) => ({ ...f, required_fields: f.required_fields?.filter((_, idx) => idx !== i) || [] }));

  const save = async () => {
    setSaving(true);
    const payload = { ...form, site_name: config.siteName };
    if (editing?.id) {
      await supabase.from('trigger_definitions').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('trigger_definitions').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const toggleEnabled = async (t: TriggerDefinition) => {
    setToggling(t.id!);
    await supabase.from('trigger_definitions').update({ enabled: !t.enabled }).eq('id', t.id);
    setToggling(null);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('trigger_definitions').delete().eq('id', id);
    setDeleteId(null);
    load();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(triggers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trigger-definitions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const set = (field: string, val: unknown) => setForm((f) => ({ ...f, [field]: val }));

  const enabledTriggers = triggers.filter((t) => t.enabled);
  const disabledTriggers = triggers.filter((t) => !t.enabled);

  const renderTriggerCard = (t: TriggerDefinition) => {
    const EventIcon = EVENT_ICONS[t.trigger_event ?? 'no_docs_in_x_days'] || Zap;
    const recipientMeta = RECIPIENT_TYPES.find((r) => r.value === t.recipient_type);
    const RecipientIcon = recipientMeta?.icon || User;
    const workflowLabel = WORKFLOWS.find((w) => w.value === t.workflow)?.label || 'Unassigned';
    return (
      <div key={t.id} className={`p-4 rounded-xl border transition-colors ${
        t.enabled
          ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/5'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <EventIcon size={13} className="text-primary-500 shrink-0" />
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t.name}</span>
              {t.enabled && <Badge variant="green" dot>Enabled</Badge>}
              {t.writeback_required && <Badge variant="orange">Writeback</Badge>}
              <Badge variant="blue">{workflowLabel}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-2">
              {[
                ['Event', TRIGGER_EVENTS.find((e) => e.value === t.trigger_event)?.label || '—'],
                ['Condition', t.condition_field ? `${t.condition_field} ${t.condition_operator} "${t.condition_value}"` : '—'],
                ['Delay', t.delay_minutes ? `${t.delay_minutes}m` : 'None'],
                ['Notify', t.notification_type || '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wide">{label}</div>
                  <div className="text-xs text-neutral-700 dark:text-neutral-300 mono truncate">{val}</div>
                </div>
              ))}
            </div>
            {/* Email template preview */}
            {t.email_subject && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <RecipientIcon size={11} className="text-neutral-400" />
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {recipientMeta?.label}: {t.email_subject}
                </span>
              </div>
            )}
            {t.required_fields?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {t.required_fields.map((f) => <Badge key={f} variant="blue">{f}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => toggleEnabled(t)}
              disabled={toggling === t.id}
              className={`p-1.5 rounded-lg transition-colors ${
                t.enabled
                  ? 'text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                  : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={t.enabled ? 'Disable trigger' : 'Enable trigger'}
            >
              {toggling === t.id ? <Spinner size={13} /> : <Power size={13} />}
            </button>
            <button onClick={() => openEdit(t)} className="btn-ghost"><Pencil size={13} /></button>
            <button onClick={() => setDeleteId(t.id || null)} className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Trigger Definitions</CardTitle>
            <CardDescription>Define automation triggers, enable them per workflow, and configure email notifications</CardDescription>
          </div>
          <div className="flex gap-2">
            {triggers.length > 0 && (
              <button onClick={exportJson} className="btn-secondary">
                <Download size={14} /> Export
              </button>
            )}
            <button onClick={openCreate} className="btn-primary">
              <Plus size={14} /> New Trigger
            </button>
          </div>
        </CardHeader>

        {loading ? <PageSpinner /> : triggers.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No triggers defined"
            description="Create a trigger to automate email notifications when conditions are met in your workflows."
            action={<button onClick={openCreate} className="btn-primary">New Trigger</button>}
          />
        ) : (
          <div className="space-y-4">
            {enabledTriggers.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Power size={12} /> Enabled Triggers ({enabledTriggers.length})
                </div>
                <div className="space-y-3">{enabledTriggers.map(renderTriggerCard)}</div>
              </div>
            )}
            {disabledTriggers.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                  Disabled ({disabledTriggers.length})
                </div>
                <div className="space-y-3">{disabledTriggers.map(renderTriggerCard)}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit: ${editing.name}` : 'New Trigger Definition'} width="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Trigger Name *</label>
              <input className="input" placeholder="e.g. Document Pending Reminder — Email Borrower" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Workflow *</label>
              <select className="input" value={form.workflow || ''} onChange={(e) => set('workflow', e.target.value)}>
                {WORKFLOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Trigger Event</label>
              <select className="input" value={form.trigger_event || ''} onChange={(e) => set('trigger_event', e.target.value)}>
                {TRIGGER_EVENTS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Data Source (Object) *</label>
              <input className="input" placeholder="e.g. Loan" value={form.data_source} onChange={(e) => set('data_source', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Notification Type</label>
              <select className="input" value={form.notification_type || ''} onChange={(e) => set('notification_type', e.target.value)}>
                {NOTIFICATION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Condition */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Trigger Condition</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Condition Field</label>
                <input className="input text-xs" placeholder="e.g. loanStatus" value={form.condition_field || ''} onChange={(e) => set('condition_field', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Operator</label>
                <select className="input text-xs" value={form.condition_operator || 'equals'} onChange={(e) => set('condition_operator', e.target.value)}>
                  {OPERATORS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Condition Value</label>
                <input className="input text-xs" placeholder="e.g. Documents Pending" value={form.condition_value || ''} onChange={(e) => set('condition_value', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Delay (minutes)</label>
                <input type="number" min={0} className="input text-xs" value={form.delay_minutes} onChange={(e) => set('delay_minutes', Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Escalation Rule</label>
                <input className="input text-xs" placeholder="e.g. Notify manager after 3 days" value={form.escalation_rule || ''} onChange={(e) => set('escalation_rule', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Email Template */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Email Template</div>
              <button onClick={() => setShowVarHint((v) => !v)} className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline">
                {showVarHint ? 'Hide' : 'Show'} variables
              </button>
            </div>
            {showVarHint && (
              <div className="mb-3 p-2.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/30">
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">Insert these placeholders in the subject or body — they get replaced with real values when the email is sent:</div>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        navigator.clipboard.writeText(v);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 hover:border-primary-400 transition-colors"
                      title="Click to copy"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Recipient</label>
                <div className="flex gap-2">
                  {RECIPIENT_TYPES.map((r) => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.value}
                        onClick={() => set('recipient_type', r.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          form.recipient_type === r.value
                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                        }`}
                      >
                        <Icon size={12} /> {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Email Subject</label>
                <input className="input text-xs font-mono" placeholder="e.g. Action Required: Missing Documents for Loan {{log_number}}" value={form.email_subject || ''} onChange={(e) => set('email_subject', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Email Body</label>
                <textarea className="input text-xs font-mono" rows={5} placeholder={'Dear {{borrower_name}},\n\nWe need the following documents for your loan {{log_number}}:\n{{missing_documents}}\n\nPlease upload them at your earliest convenience.\n\nThank you,\nYour Organization'} value={form.email_body || ''} onChange={(e) => set('email_body', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Required Fields */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Required Fields</label>
            <div className="flex gap-2 mb-2">
              <input className="input flex-1 text-xs" placeholder="Field name…" value={fieldInput} onChange={(e) => setFieldInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addField()} />
              <button onClick={addField} className="btn-secondary text-xs">Add</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {form.required_fields?.map((f, i) => (
                <button key={i} onClick={() => removeField(i)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors">
                  {f} ×
                </button>
              ))}
            </div>
          </div>

          {/* Notes + Writeback */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Notes</label>
                <textarea className="input" rows={2} placeholder="Optional notes…" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.writeback_required} onChange={(e) => set('writeback_required', e.target.checked)} className="accent-primary-600" />
                <span className="text-xs text-neutral-700 dark:text-neutral-300">Writeback Required (this trigger writes data back to the API)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 sticky bottom-0 bg-white dark:bg-neutral-900">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving || !form.name || !form.data_source} className="btn-primary">
              {saving ? <Spinner size={14} /> : <Zap size={14} />} Save Trigger
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Trigger" width="sm">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">Delete this trigger definition? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => deleteId && remove(deleteId)} className="btn-danger">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
