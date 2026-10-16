import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLogs } from '../contexts/LogContext';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Minus } from 'lucide-react';
import type { CapabilityResult } from '../types';

type ReadinessColor = 'green' | 'yellow' | 'red';

interface ObjectReadiness {
  object: string;
  read: ReadinessColor;
  create: ReadinessColor;
  update: ReadinessColor;
  delete: ReadinessColor;
  blockers: string[];
  score: number;
}

// Actual objects confirmed present in the Ventures API
const KEY_OBJECTS = ['Loan', 'Contact', 'LoanNote', 'LoanDocument', 'LoanContact', 'LoanEntity', 'Company'];

function colorToScore(c: ReadinessColor): number {
  return c === 'green' ? 1 : c === 'yellow' ? 0.5 : 0;
}

function ColorIcon({ color }: { color: ReadinessColor }) {
  if (color === 'green') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (color === 'yellow') return <AlertTriangle size={14} className="text-amber-500" />;
  return <XCircle size={14} className="text-red-500" />;
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-neutral-200 dark:text-neutral-700" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="text-center">
        <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{pct}%</div>
        <div className="text-[10px] text-neutral-500">Readiness</div>
      </div>
    </div>
  );
}

export default function Reports() {
  const { config, status } = useAuth();
  const { logs } = useLogs();
  const [capabilities, setCapabilities] = useState<CapabilityResult[]>([]);

  const loadCapabilities = async () => {
    const { data } = await supabase.from('capability_results').select('*').eq('site_name', config.siteName);
    setCapabilities(data || []);
  };

  useEffect(() => { loadCapabilities(); }, [config.siteName]);

  // Build readiness from capabilities + key objects defaults
  const readinessMap: Record<string, ObjectReadiness> = {};
  KEY_OBJECTS.forEach((obj) => {
    const cap = capabilities.find((c) => c.object_name.toLowerCase() === obj.toLowerCase());
    const blockers: string[] = [];
    const read: ReadinessColor = cap ? (cap.can_read ? 'green' : 'red') : 'yellow';
    const create: ReadinessColor = cap ? (cap.can_create ? 'green' : 'red') : 'yellow';
    const update: ReadinessColor = cap ? (cap.can_update ? 'green' : 'red') : 'yellow';
    const del: ReadinessColor = cap ? (cap.can_delete ? 'green' : 'red') : 'yellow';
    if (read === 'red') blockers.push('Read not supported');
    if (create === 'red') blockers.push('Create blocked');
    if (cap?.read_error) blockers.push(`Read: ${cap.read_error}`);
    const score = (colorToScore(read) + colorToScore(create) + colorToScore(update) + colorToScore(del)) / 4;
    readinessMap[obj] = { object: obj, read, create, update, delete: del, blockers, score };
  });

  const overallScore = Object.values(readinessMap).reduce((s, r) => s + r.score, 0) / KEY_OBJECTS.length;

  const generateMarkdown = () => {
    const now = new Date().toLocaleString();
    const lines = [
      `# Ventures API — CRM Configuration Report`,
      `**Generated:** ${now}`,
      `**Site:** ${config.siteName || '(not configured)'}`,
      `**Overall Readiness:** ${Math.round(overallScore * 100)}%`,
      '',
      `## Object Readiness`,
      '',
      '| Object | Read | Create | Update | Delete | Score |',
      '|--------|------|--------|--------|--------|-------|',
      ...Object.values(readinessMap).map((r) =>
        `| ${r.object} | ${r.read === 'green' ? '✅' : r.read === 'yellow' ? '🟡' : '❌'} | ${r.create === 'green' ? '✅' : r.create === 'yellow' ? '🟡' : '❌'} | ${r.update === 'green' ? '✅' : r.update === 'yellow' ? '🟡' : '❌'} | ${r.delete === 'green' ? '✅' : r.delete === 'yellow' ? '🟡' : '❌'} | ${Math.round(r.score * 100)}% |`
      ),
      '',
      `## Blockers`,
      ...Object.values(readinessMap).flatMap((r) =>
        r.blockers.length > 0 ? [`- **${r.object}**: ${r.blockers.join('; ')}`] : []
      ),
      '',
      `## API Activity Summary`,
      `- Total API Calls: ${logs.length}`,
      `- Errors: ${logs.filter((l) => l.status_code && l.status_code >= 400).length}`,
      `- Avg Latency: ${logs.length ? Math.round(logs.reduce((s, l) => s + (l.duration_ms || 0), 0) / logs.length) : 0}ms`,
      '',
      `## Recommendations`,
      '',
      '### Automation Triggers',
      '- Loan Intake Follow-Up: trigger on Documents Pending + inactivity threshold',
      '- Servicing Tickler: upcoming/overdue/escalation reminders',
      '',
      '### Middleware Requirements',
      '- Notification dispatch (email, Teams) — requires external service or Power Automate connector',
      '- Document checklist tracking — may require custom endpoint if native support unavailable',
      '',
      '### Power Automate Feasibility',
      '- HTTP connector can call Ventures API if Bearer token management is handled',
      '- Recommend custom connector with OAuth2 for production automation',
      '',
      '### Writeback Support',
      `- Based on capability testing: ${capabilities.filter((c) => c.can_create || c.can_update).length} objects support write operations`,
      '',
      `---`,
      `*Report generated by Ventures API Toolkit — Built by PointClick Technologies*`,
    ];
    return lines.join('\n');
  };

  const downloadMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventures-api-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPdf = () => window.print();

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header + score */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-6">
          <ScoreRing score={overallScore} />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Workflow Readiness Score</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs">
              Based on {KEY_OBJECTS.length} key objects. {capabilities.length === 0 ? 'Run capability tests to improve accuracy.' : `${capabilities.length} objects tested.`}
            </p>
            {status !== 'connected' && <Badge variant="yellow" className="mt-2" dot>API not connected — scores estimated</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadCapabilities} className="btn-secondary">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={downloadMarkdown} className="btn-secondary">
            <Download size={13} /> Markdown
          </button>
          <button onClick={printPdf} className="btn-primary">
            <Download size={13} /> PDF
          </button>
        </div>
      </div>

      {capabilities.length === 0 && (
        <Alert variant="info">
          No capability test results found for site "{config.siteName || 'unknown'}". Run the API Discovery workflow to populate results, or use the Read/Write Validation from the API Explorer.
        </Alert>
      )}

      {/* Object readiness table */}
      <Card padding="none">
        <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Object Readiness</h3>
          <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" /> Supported</span>
            <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-amber-500" /> Unknown</span>
            <span className="flex items-center gap-1"><XCircle size={12} className="text-red-500" /> Blocked</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">Object</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-neutral-600 dark:text-neutral-400">Read</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-neutral-600 dark:text-neutral-400">Create</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-neutral-600 dark:text-neutral-400">Update</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-neutral-600 dark:text-neutral-400">Delete</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">Score</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">Blockers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {Object.values(readinessMap).map((r) => (
                <tr key={r.object} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium text-neutral-800 dark:text-neutral-200">{r.object}</td>
                  <td className="px-4 py-3 text-center"><ColorIcon color={r.read} /></td>
                  <td className="px-4 py-3 text-center"><ColorIcon color={r.create} /></td>
                  <td className="px-4 py-3 text-center"><ColorIcon color={r.update} /></td>
                  <td className="px-4 py-3 text-center"><ColorIcon color={r.delete} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.score >= 0.75 ? 'bg-emerald-500' : r.score >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.round(r.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{Math.round(r.score * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.blockers.length === 0 ? (
                      <Minus size={13} className="text-neutral-300 dark:text-neutral-700" />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.blockers.map((b, i) => <Badge key={i} variant="red" size="sm">{b}</Badge>)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>Recommended Automation Triggers</CardTitle></CardHeader>
          <div className="space-y-3 text-xs text-neutral-700 dark:text-neutral-300">
            {[
              { trigger: 'Document Pending Reminder', condition: 'Loan.loanStatus = "Documents Pending" AND LoanDocument count = 0 AND days_since_updatedDate > threshold', dest: 'Borrower Email + Internal Alert' },
              { trigger: 'Inactivity Follow-Up Alert', condition: 'Loan.updatedDate > 14 days AND loanStatus = "In Process"', dest: 'Assigned BDO Internal Alert' },
              { trigger: 'Status Change Notification', condition: 'Loan.loanStatus changed to "Approved" or "Declined"', dest: 'Borrower Email + BDO Email' },
              { trigger: 'Missing Contact Info Alert', condition: 'Loan.primaryContactId set AND Contact.email is empty', dest: 'BDO Internal Task' },
            ].map((t) => (
              <div key={t.trigger} className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">{t.trigger}</div>
                <div className="mono text-[11px] text-neutral-500 mb-1">{t.condition}</div>
                <Badge variant="blue" size="sm">{t.dest}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>API Limitations & Middleware</CardTitle></CardHeader>
          <div className="space-y-3 text-xs">
            {[
              { label: 'Notification Dispatch', status: 'yellow', note: 'Ventures does not send emails natively — requires Power Automate or middleware' },
              { label: 'LoanNote Creation', status: 'green', note: 'Confirmed via LoanNote object — use createRecord("LoanNote", { loanId, note, noteType })' },
              { label: 'Document Checklist', status: 'green', note: 'LoanDocument list endpoint confirmed — filter by loanId for per-loan document counts' },
              { label: 'Teams Integration', status: 'red', note: 'Requires Teams connector — Power Automate recommended' },
              { label: 'OAuth Token Refresh', status: 'green', note: 'Handled by toolkit AuthService — use same pattern in production' },
              { label: 'Webhook / Event Push', status: 'red', note: 'Ventures API is pull-only — polling required for trigger detection' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <Badge variant={item.status as 'green' | 'yellow' | 'red'} size="sm" className="shrink-0 mt-0.5">
                  {item.status === 'green' ? '✓' : item.status === 'yellow' ? '~' : '✗'}
                </Badge>
                <div>
                  <div className="font-medium text-neutral-800 dark:text-neutral-200">{item.label}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{item.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Power Automate feasibility */}
      <Card>
        <CardHeader>
          <CardTitle>Power Automate Feasibility</CardTitle>
          <Badge variant="yellow" dot>Assessment</Badge>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {[
            { label: 'HTTP Connector', verdict: 'Feasible', note: 'Standard Power Automate HTTP connector can call Ventures API with Bearer token from Key Vault', color: 'green' as const },
            { label: 'Custom Connector', verdict: 'Recommended', note: 'Build a custom connector with OAuth2 for clean BDO self-service automation', color: 'blue' as const },
            { label: 'Real-time Triggers', verdict: 'Polling Required', note: 'No webhook endpoint confirmed — use Recurrence trigger in Power Automate to poll', color: 'yellow' as const },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">{item.label}</div>
              <Badge variant={item.color} className="mb-2">{item.verdict}</Badge>
              <div className="text-neutral-500 dark:text-neutral-400 leading-relaxed">{item.note}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
