import { useState, useEffect, useCallback } from 'react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import { Spinner } from '../components/ui/EmptyState';
import { supabase } from '../lib/supabase';
import { sendEmail } from '../services/notificationService';
import type { NotificationLog } from '../types';
import {
  Mail, MessageSquare, CheckSquare, Users,
  Send, CheckCircle2, XCircle, RefreshCw, History,
} from 'lucide-react';

type TabType = 'borrower_email' | 'internal_email' | 'teams' | 'task';

interface FormValues {
  borrowerName: string;
  borrowerEmail: string;
  logNumber: string;
  loanId: string;
  dueDate: string;
  missingDocs: string;
  bdo: string;
  threshold: string;
  taskAssignee: string;
}

const tabs: Array<{ id: TabType; label: string; icon: React.ElementType }> = [
  { id: 'borrower_email', label: 'Borrower Email',    icon: Mail },
  { id: 'internal_email', label: 'Internal Email',    icon: Users },
  { id: 'teams',          label: 'Teams Notification', icon: MessageSquare },
  { id: 'task',           label: 'Task Creation',      icon: CheckSquare },
];

const defaultForm: FormValues = {
  borrowerName: 'Sample Borrower LLC',
  borrowerEmail: 'borrower@example.com',
  logNumber: 'SAMPLE000001',
  loanId: '1001',
  dueDate: '2026-12-31',
  missingDocs: 'Bank Statements (6mo), Personal Financial Statement',
  bdo: 'Loan Officer Name',
  threshold: '7',
  taskAssignee: 'Team Member',
};

export default function NotificationSimulator() {
  const [active, setActive] = useState<TabType>('borrower_email');
  const [form, setForm] = useState<FormValues>(defaultForm);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const set = (k: keyof FormValues, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const templates: Record<TabType, { subject: string; body: string; meta?: Record<string, string> }> = {
    borrower_email: {
      subject: `Action Required: Missing Documents for Loan ${form.logNumber}`,
      body: `Dear ${form.borrowerName},

We are reviewing your loan application (Log #${form.logNumber}) and need the following documents to continue:

${form.missingDocs.split(',').map((d) => `  - ${d.trim()}`).join('\n')}

Please upload these documents to your applicant portal or email them to your assigned Business Development Officer, ${form.bdo}.

This request has been pending for more than ${form.threshold} days. Prompt submission will help us process your application quickly.

If you have questions, please contact us at lending@example.com or (555) 010-0000.

Thank you,
Your Organization — Lending Team`,
    },
    internal_email: {
      subject: `[ALERT] Documents Pending — Loan ${form.logNumber} (${form.borrowerName}) — ${form.threshold}+ Days`,
      body: `Internal Notice — Loan Review Team

Log Number: ${form.logNumber}
Loan ID: ${form.loanId}
Borrower: ${form.borrowerName}
Assigned BDO: ${form.bdo}

STATUS: Documents Pending
Days Since Last Activity: ${form.threshold}+

Missing Documents:
${form.missingDocs.split(',').map((d) => `  - ${d.trim()}`).join('\n')}

ACTION REQUIRED:
1. Contact borrower to request outstanding documents
2. Log contact attempt in Ventures (create LoanNote with noteType = "Contact")
3. Update loanStatus if borrower is unresponsive

Automated reminder sent to borrower on ${new Date().toLocaleDateString()}.

— Ventures API Automation`,
    },
    teams: {
      subject: 'Teams Channel: #loan-servicing',
      body: `[Loan Follow-Up Required]
${form.logNumber} — ${form.borrowerName}

Status: Documents Pending
BDO: ${form.bdo}
Outstanding: ${form.missingDocs}
Days Inactive: ${form.threshold}+

Borrower reminder sent | View in Ventures (https://ventures.example.com)`,
      meta: { channel: '#loan-servicing', workspace: 'Your Organization' },
    },
    task: {
      subject: `Follow Up: ${form.logNumber} — Missing Documents`,
      body: `Task: Follow up with ${form.borrowerName} regarding missing documents for Loan ${form.logNumber}.

Documents needed: ${form.missingDocs}

Log contact in Ventures after reaching out (create LoanNote with noteType = "Follow-Up").

Due: ${form.dueDate}`,
      meta: { assignee: form.taskAssignee, priority: 'High', due_date: form.dueDate, related_record: form.logNumber },
    },
  };

  const current = templates[active];

  const loadLogs = useCallback(async () => {
    setLogLoading(true);
    const { data } = await supabase
      .from('notification_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLogLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleSendTestEmail = async () => {
    const recipient = active === 'borrower_email'
      ? form.borrowerEmail
      : `lending-team@example.com`;
    setSending(true);
    setSendResult(null);
    const result = await sendEmail({
      to: recipient,
      subject: current.subject,
      body: current.body,
      triggerName: 'Notification Simulator (manual test)',
      recipientType: active === 'borrower_email' ? 'borrower' : 'internal',
      notificationType: active === 'teams' ? 'teams' : 'email',
      context: {
        source: 'notification_simulator',
        log_number: form.logNumber,
        borrower_name: form.borrowerName,
      },
    });
    setSending(false);
    setSendResult({
      success: result.success,
      message: result.success
        ? `Email sent to ${recipient}`
        : `Failed: ${result.error}`,
    });
    loadLogs();
  };

  const canSendEmail = active === 'borrower_email' || active === 'internal_email';

  return (
    <div className="max-w-4xl space-y-5">
      <Alert variant={canSendEmail ? 'info' : 'warning'} title={canSendEmail ? 'Live Email Testing' : 'Simulation Only'}>
        {canSendEmail
          ? 'You can send a real test email through Resend using the Send button below. All sends are logged in the notification history.'
          : 'Teams and Task notifications are simulation-only previews. Use the email tabs to send real test emails.'}
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Variables */}
        <Card>
          <CardHeader>
            <CardTitle>Template Variables</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {(Object.keys(defaultForm) as (keyof FormValues)[]).map((key) => (
              <div key={key}>
                <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1 uppercase tracking-wide">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  className="input text-xs"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setActive(id); setSendResult(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-all ${active === id ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Preview card */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <Badge variant={canSendEmail ? 'blue' : 'orange'} dot>{canSendEmail ? 'LIVE' : 'SIMULATION'}</Badge>
              {active === 'teams' && current.meta && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Workspace: {current.meta.workspace} · {current.meta.channel}
                </div>
              )}
              {active === 'task' && current.meta && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Assignee: {current.meta.assignee} · Priority: {current.meta.priority}
                </div>
              )}
            </div>

            {/* Email header */}
            {(active === 'borrower_email' || active === 'internal_email') && (
              <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg space-y-1">
                <div className="flex gap-2 text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 w-12">From:</span>
                  <span className="text-neutral-700 dark:text-neutral-300">lending@example.com</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 w-12">To:</span>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {active === 'borrower_email' ? form.borrowerEmail : `lending-team@example.com, ${form.bdo.toLowerCase().replace(' ', '.')}@example.com`}
                  </span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 w-12">Subject:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{current.subject}</span>
                </div>
              </div>
            )}

            {active === 'teams' && (
              <div className="mb-4 p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs text-neutral-500">
                <span className="font-mono">#loan-servicing</span> · Teams Channel
              </div>
            )}

            {active === 'task' && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {current.meta && Object.entries(current.meta).map(([k, v]) => (
                  <div key={k} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs">
                    <div className="text-neutral-400 uppercase text-[10px] tracking-wide">{k.replace('_', ' ')}</div>
                    <div className="text-neutral-700 dark:text-neutral-300 font-medium">{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Body */}
            <div className={`rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed ${active === 'teams' ? 'bg-neutral-900 dark:bg-neutral-950 font-mono text-green-400 text-xs' : 'bg-white dark:bg-neutral-800/50 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700'}`}>
              {current.body}
            </div>

            {/* Send button + result */}
            {canSendEmail && (
              <div className="mt-4 space-y-2">
                <button onClick={handleSendTestEmail} disabled={sending} className="btn-primary w-full">
                  {sending
                    ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                    : <><Send size={14} /> Send Test Email via Resend</>}
                </button>
                {sendResult && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 ${
                    sendResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30'
                      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30'
                  }`}>
                    {sendResult.success
                      ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      : <XCircle size={14} className="text-red-600 shrink-0" />}
                    <span className={`text-xs ${sendResult.success ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                      {sendResult.message}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Notification History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History size={15} className="text-neutral-400" />
            <CardTitle>Notification History</CardTitle>
          </div>
          <button onClick={loadLogs} className="btn-ghost text-xs">
            <RefreshCw size={12} /> Refresh
          </button>
        </CardHeader>
        {logLoading ? (
          <div className="py-6 flex justify-center"><Spinner size={18} className="text-neutral-400" /></div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            No notifications sent yet. Use the Send button above or trigger an email from a workflow to see the log here.
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700/50">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  log.status === 'sent' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {log.status === 'sent'
                    ? <CheckCircle2 size={13} className="text-emerald-600" />
                    : <XCircle size={13} className="text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {log.trigger_name && <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{log.trigger_name}</span>}
                    <Badge variant={log.status === 'sent' ? 'green' : 'red'}>{log.status}</Badge>
                    <Badge variant="blue">{log.recipient_type || 'unknown'}</Badge>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                    To: {log.recipient} · {log.subject}
                  </div>
                  {log.error_message && (
                    <div className="text-[11px] text-red-500 truncate mt-0.5">{log.error_message}</div>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400 shrink-0 whitespace-nowrap">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
