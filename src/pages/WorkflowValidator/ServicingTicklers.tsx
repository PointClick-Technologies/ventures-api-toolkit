import { useState, useEffect, useCallback } from 'react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { TriggerDefinition } from '../../types';
import {
  sendEmail, renderTemplate, resolveRecipient,
  type TriggerContext,
} from '../../services/notificationService';
import {
  PlayCircle, Bell, AlertTriangle, CheckCircle2, TrendingUp,
  Zap, Power, RefreshCw, XCircle,
} from 'lucide-react';

type TicklerAction = 'upcoming' | 'overdue' | 'escalation' | 'completion';

interface SimResult {
  action: TicklerAction;
  tickler: SimTickler;
  outcome: string[];
  triggerName?: string;
  emailSent?: boolean;
  emailError?: string;
  emailRecipient?: string;
}

interface SimTickler {
  id: string;
  name: string;
  dueDate: string;
  owner: string;
  status: string;
  relatedLoan: string;
  relatedBorrower: string;
  borrowerEmail: string;
}

const SIM_TICKLERS: SimTickler[] = [
  { id: 'T-001', name: 'Insurance Certificate Review', dueDate: '2026-12-28', owner: 'Team Member A', status: 'Open', relatedLoan: 'LN-2024-042', relatedBorrower: 'Sample Borrower LLC', borrowerEmail: 'borrower@example.com' },
  { id: 'T-002', name: 'Annual Financial Statement', dueDate: '2026-12-15', owner: 'Team Member B', status: 'Overdue', relatedLoan: 'LN-2024-019', relatedBorrower: 'Sample Business Inc', borrowerEmail: 'contact@example-business.com' },
  { id: 'T-003', name: 'Site Inspection', dueDate: '2027-01-10', owner: 'Team Member C', status: 'Open', relatedLoan: 'LN-2024-055', relatedBorrower: 'Sample Company LLC', borrowerEmail: 'info@example-company.com' },
  { id: 'T-004', name: 'UCC Filing Renewal', dueDate: '2026-12-05', owner: 'Team Member D', status: 'Overdue', relatedLoan: 'LN-2024-031', relatedBorrower: 'Sample Organization', borrowerEmail: 'admin@example-org.org' },
];

const ACTION_ICONS: Record<TicklerAction, React.ElementType> = {
  upcoming: Bell,
  overdue: AlertTriangle,
  escalation: TrendingUp,
  completion: CheckCircle2,
};

const ACTION_VARIANTS: Record<TicklerAction, 'blue' | 'red' | 'orange' | 'green'> = {
  upcoming: 'blue',
  overdue: 'red',
  escalation: 'orange',
  completion: 'green',
};

const ACTION_EVENT_MAP: Record<TicklerAction, string> = {
  upcoming: 'tickler_upcoming',
  overdue: 'tickler_overdue',
  escalation: 'tickler_escalation',
  completion: 'tickler_completion',
};

export default function ServicingTicklers() {
  useAuth();
  const [selectedSim, setSelectedSim] = useState<SimTickler>(SIM_TICKLERS[0]);
  const [action, setAction] = useState<TicklerAction>('upcoming');
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [selectedTriggerId, setSelectedTriggerId] = useState('');
  const [sending, setSending] = useState(false);

  const loadTriggers = useCallback(async () => {
    const { data } = await supabase
      .from('trigger_definitions')
      .select('*')
      .eq('workflow', 'servicing_ticklers')
      .eq('enabled', true)
      .order('created_at', { ascending: false });
    setTriggers(data || []);
  }, []);

  useEffect(() => { loadTriggers(); }, [loadTriggers]);

  const selectedTrigger = triggers.find((t) => t.id === selectedTriggerId) || null;
  const matchingTriggers = triggers.filter((t) => t.trigger_event === ACTION_EVENT_MAP[action]);

  const buildTriggerContext = (tickler: SimTickler): TriggerContext => ({
    borrower_name: tickler.relatedBorrower,
    borrower_email: tickler.borrowerEmail,
    log_number: tickler.relatedLoan,
    tickler_name: tickler.name,
    tickler_due_date: tickler.dueDate,
    tickler_owner: tickler.owner,
    current_status: tickler.status,
  });

  const testAction = async () => {
    setSimResult(null);

    // If a matching trigger is selected, evaluate and send email
    if (selectedTrigger && selectedTrigger.email_subject && selectedTrigger.email_body) {
      const ctx = buildTriggerContext(selectedSim);
      const recipient = resolveRecipient(selectedTrigger, ctx);

      let emailSent = false;
      let emailError: string | undefined;
      let emailRecipient: string | undefined;

      if (recipient) {
        setSending(true);
        const subject = renderTemplate(selectedTrigger.email_subject, ctx);
        const body = renderTemplate(selectedTrigger.email_body, ctx);
        const result = await sendEmail({
          to: recipient.email,
          subject,
          body,
          triggerId: selectedTrigger.id,
          triggerName: selectedTrigger.name,
          recipientType: selectedTrigger.recipient_type,
          notificationType: selectedTrigger.notification_type,
          context: { ...ctx, workflow: 'servicing_ticklers', action },
        });
        setSending(false);
        emailSent = result.success;
        emailError = result.success ? undefined : result.error;
        emailRecipient = recipient.email;
      } else {
        emailError = `No recipient email resolved for type "${selectedTrigger.recipient_type}"`;
      }

      setSimResult({
        action,
        tickler: selectedSim,
        outcome: [
          `[TRIGGER] ${selectedTrigger.name}`,
          `[EMAIL] To: ${emailRecipient || 'unresolved'}`,
          `[SUBJECT] ${selectedTrigger.email_subject}`,
          emailSent ? `[STATUS] Email sent successfully` : `[ERROR] ${emailError}`,
        ],
        triggerName: selectedTrigger.name,
        emailSent,
        emailError,
        emailRecipient,
      });
      return;
    }

    // Fallback: simulation-only outcome
    const outcomes: Record<TicklerAction, (t: SimTickler) => string[]> = {
      upcoming: (t) => [
        `[EMAIL] To: ${t.owner}`,
        `Subject: Upcoming Tickler: ${t.name}`,
        `Body: Reminder — ${t.name} for ${t.relatedBorrower} (${t.relatedLoan}) is due ${t.dueDate}.`,
        `[TASK] Create follow-up task assigned to ${t.owner}`,
        `[LOG] Activity logged to loan ${t.relatedLoan}`,
      ],
      overdue: (t) => [
        `[EMAIL] To: ${t.owner}; CC: Loan Officer Supervisor`,
        `Subject: OVERDUE: ${t.name}`,
        `Body: The tickler "${t.name}" for ${t.relatedBorrower} (${t.relatedLoan}) was due ${t.dueDate} and remains open.`,
        `[ALERT] Dashboard flag on loan ${t.relatedLoan}`,
        `[TASK] Escalation task created`,
        `[LOG] Overdue notice logged`,
      ],
      escalation: (t) => [
        `[EMAIL] To: Portfolio Manager, Senior Loan Officer`,
        `Subject: ESCALATION: ${t.name} — ${t.relatedBorrower}`,
        `Body: Tickler "${t.name}" has been overdue for 14+ days. Loan: ${t.relatedLoan}. Assigned: ${t.owner}.`,
        `[TEAMS] Message to #loan-servicing channel`,
        `[STATUS] Tickler marked "Escalated"`,
        `[LOG] Escalation event recorded`,
      ],
      completion: (t) => [
        `[EMAIL] To: ${t.owner}`,
        `Subject: Tickler Completed: ${t.name}`,
        `Body: Tickler "${t.name}" for ${t.relatedBorrower} has been marked complete.`,
        `[STATUS] Tickler closed`,
        `[WRITEBACK] status → "Completed", completion_date → today`,
        `[LOG] Completion recorded on ${t.relatedLoan}`,
      ],
    };

    setSimResult({
      action,
      tickler: selectedSim,
      outcome: outcomes[action](selectedSim),
    });
  };

  const isOverdue = (t: SimTickler) => new Date(t.dueDate) < new Date() || t.status === 'Overdue';

  return (
    <div className="space-y-5">
      <Alert variant="info">
        {triggers.length > 0
          ? 'Enabled triggers from the Trigger Builder are available below. Select a trigger to send real email notifications when an action fires.'
          : 'No enabled triggers for Servicing Ticklers yet. Create and enable triggers in the Trigger Builder to send real emails.'}
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Tickler list */}
        <Card>
          <CardHeader>
            <CardTitle>Ticklers</CardTitle>
            <Badge variant="yellow">{SIM_TICKLERS.filter(isOverdue).length} overdue</Badge>
          </CardHeader>
          <div className="space-y-2">
            {SIM_TICKLERS.map((t) => {
              const overdue = isOverdue(t);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedSim(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${selectedSim.id === t.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{t.name}</span>
                    <Badge variant={overdue ? 'red' : 'blue'} dot>{overdue ? 'Overdue' : 'Open'}</Badge>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 space-y-0.5">
                    <div>Due: {t.dueDate} · Owner: {t.owner}</div>
                    <div>{t.relatedLoan} · {t.relatedBorrower}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Action tester */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Selected Tickler</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-xs">
              {[
                ['ID', selectedSim.id],
                ['Name', selectedSim.name],
                ['Due Date', selectedSim.dueDate],
                ['Owner', selectedSim.owner],
                ['Status', selectedSim.status],
                ['Loan', selectedSim.relatedLoan],
                ['Borrower', selectedSim.relatedBorrower],
                ['Email', selectedSim.borrowerEmail],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">{label}</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-medium">{val}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Test Action</CardTitle></CardHeader>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['upcoming', 'overdue', 'escalation', 'completion'] as TicklerAction[]).map((a) => {
                const Icon = ACTION_ICONS[a];
                return (
                  <button
                    key={a}
                    onClick={() => { setAction(a); setSelectedTriggerId(''); setSimResult(null); }}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${action === a ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'}`}
                  >
                    <Icon size={13} /> {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* Matching triggers for this action */}
            {matchingTriggers.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                  <Zap size={11} className="text-primary-500" />
                  Triggers for this action ({matchingTriggers.length})
                </div>
                {matchingTriggers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTriggerId(t.id === selectedTriggerId ? '' : (t.id || '')); setSimResult(null); }}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all ${selectedTriggerId === t.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Power size={11} className={selectedTriggerId === t.id ? 'text-primary-500' : 'text-emerald-500'} />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{t.name}</span>
                    </div>
                    {selectedTriggerId === t.id && t.email_subject && (
                      <div className="mt-1 pl-5 text-[10px] font-mono text-neutral-500 truncate">{t.email_subject}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button onClick={testAction} disabled={sending} className="btn-primary w-full">
              {sending
                ? <><RefreshCw size={14} className="animate-spin" /> Sending Email…</>
                : <><PlayCircle size={14} /> {selectedTrigger ? 'Test & Send Email' : 'Simulate Action'}</>}
            </button>
          </Card>
        </div>
      </div>

      {/* Result */}
      {simResult && (
        <Card className={`border-2 ${ACTION_VARIANTS[simResult.action] === 'green' ? 'border-emerald-400' : ACTION_VARIANTS[simResult.action] === 'red' ? 'border-red-400' : ACTION_VARIANTS[simResult.action] === 'orange' ? 'border-orange-400' : 'border-primary-400'}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {(() => { const Icon = ACTION_ICONS[simResult.action]; return <Icon size={16} className={`text-${ACTION_VARIANTS[simResult.action] === 'green' ? 'emerald' : ACTION_VARIANTS[simResult.action] === 'red' ? 'red' : ACTION_VARIANTS[simResult.action] === 'orange' ? 'orange' : 'primary'}-500`} />; })()}
              <CardTitle>{simResult.triggerName ? `${simResult.triggerName} — ` : ''}Result — {simResult.action.toUpperCase()}</CardTitle>
            </div>
            <Badge variant={simResult.emailSent ? 'green' : simResult.emailError ? 'red' : ACTION_VARIANTS[simResult.action]}>
              {simResult.emailSent ? 'EMAIL SENT' : simResult.emailError ? 'EMAIL FAILED' : 'SIMULATION ONLY'}
            </Badge>
          </CardHeader>
          <div className="space-y-1.5 font-mono">
            {simResult.outcome.map((line, i) => (
              <div key={i} className={`text-xs px-3 py-1.5 rounded ${
                line.startsWith('[EMAIL]') || line.startsWith('[SUBJECT]') ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300' :
                line.startsWith('[TEAMS]') ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300' :
                line.startsWith('[STATUS]') || line.startsWith('[WRITEBACK]') ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' :
                line.startsWith('[TASK]') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' :
                line.startsWith('[ALERT]') || line.startsWith('[ERROR]') ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300' :
                line.startsWith('[TRIGGER]') ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300' :
                'bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
              }`}>
                {line}
              </div>
            ))}
          </div>
          {simResult.emailSent && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-xs text-emerald-800 dark:text-emerald-300">
                Email sent to {simResult.emailRecipient} via Resend
              </span>
            </div>
          )}
          {simResult.emailError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 flex items-center gap-2">
              <XCircle size={14} className="text-red-600" />
              <span className="text-xs text-red-800 dark:text-red-300">{simResult.emailError}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
