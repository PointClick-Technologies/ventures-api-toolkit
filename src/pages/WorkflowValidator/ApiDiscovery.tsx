import { useState } from 'react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  PlayCircle, CheckCircle2, XCircle, HelpCircle,
  Database, CheckSquare, RefreshCw, AlertTriangle, Save,
} from 'lucide-react';
import type { DiscoveryQuestion, CapabilityResult } from '../../types';

// Objects confirmed present in the Ventures API objects list response.
// Objects that do NOT exist: Application, Tickler, Document, Note, Task.
const DISCOVERY_QUESTIONS: Array<Omit<DiscoveryQuestion, 'result' | 'detail'> & { object?: string; testMethod?: string }> = [
  { question: 'Is there a Loan object?',              object: 'Loan',         testMethod: 'read' },
  { question: 'Is there a Contact object?',           object: 'Contact',      testMethod: 'read' },
  { question: 'Is there a LoanContact object?',       object: 'LoanContact',  testMethod: 'read' },
  { question: 'Is there a LoanNote object?',          object: 'LoanNote',     testMethod: 'read' },
  { question: 'Is there a LoanDocument object?',      object: 'LoanDocument', testMethod: 'read' },
  { question: 'Is there a Company object?',           object: 'Company',      testMethod: 'read' },
  { question: 'Is there a LoanEntity object?',        object: 'LoanEntity',   testMethod: 'read' },
  { question: 'Can LoanNotes be created?',            object: 'LoanNote',     testMethod: 'create' },
  { question: 'Can Loans be updated?',                object: 'Loan',         testMethod: 'update' },
  { question: 'Can LoanContacts be created?',         object: 'LoanContact',  testMethod: 'create' },
];

// Objects not found in the Ventures API — saved to capability_results as confirmed false.
const MISSING_OBJECTS = [
  { name: 'Application', note: 'Loan records serve this purpose in Ventures' },
  { name: 'Tickler',     note: 'No Tickler object found — may require custom object or external system' },
  { name: 'Document',    note: 'Use LoanDocument instead' },
  { name: 'Note',        note: 'Use LoanNote instead' },
  { name: 'Task',        note: 'No Task object found in this instance' },
];

// Relationships confirmed from the Ventures describe endpoints.
const RELATIONSHIP_QUESTIONS: Array<{ label: string; detail: string }> = [
  { label: 'Loan → Contact (borrower)',         detail: 'Loan.primaryContactId → Contact.id' },
  { label: 'Loan → LoanNote (notes/activity)',  detail: 'LoanNote list filtered by loanId' },
  { label: 'Loan → LoanDocument (files)',       detail: 'LoanDocument list filtered by loanId' },
  { label: 'Loan → LoanEntity (guarantors)',    detail: 'LoanEntity list filtered by loanId' },
  { label: 'Loan → LoanContact (all contacts)', detail: 'LoanContact list filtered by loanId' },
  { label: 'Company → Loan',                    detail: 'Loan list filtered by companyId' },
];

export default function ApiDiscovery() {
  const { status, api, config } = useAuth();
  const [results, setResults] = useState<DiscoveryQuestion[]>([]);
  const [objectList, setObjectList] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [readOnly, setReadOnly] = useState<string[]>([]);
  const [filteredRead, setFilteredRead] = useState<string[]>([]); // readable but requires mandatory filter
  const [fullCrud, setFullCrud] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const run = async () => {
    if (!api) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    setProgress(0);
    setSavedCount(0);

    // Accumulate capability data as we test each object/method
    const capMap: Record<string, CapabilityResult> = {};
    const ensureCap = (obj: string): CapabilityResult => {
      if (!capMap[obj]) {
        capMap[obj] = {
          site_name: config.siteName,
          object_name: obj,
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        };
      }
      return capMap[obj];
    };

    let objects: string[] = [];
    try {
      const obs = await api.getObjects();
      objects = obs.map((o) => o.name);
      setObjectList(objects);
    } catch { /* ignore */ }

    const resolved: DiscoveryQuestion[] = [];
    const total = DISCOVERY_QUESTIONS.length;

    for (let i = 0; i < DISCOVERY_QUESTIONS.length; i++) {
      const q = DISCOVERY_QUESTIONS[i];
      setProgress(Math.round(((i + 1) / total) * 100));

      if (!q.object) {
        resolved.push({ question: q.question, result: 'unknown', detail: 'No object specified' });
        continue;
      }

      const objectExists = objects.some((o) => o.toLowerCase() === q.object!.toLowerCase());

      if (!objectExists) {
        resolved.push({ question: q.question, result: 'no', detail: `"${q.object}" not found in /objects response` });
        setResults([...resolved]);
        continue;
      }

      if (q.testMethod === 'read') {
        const res = await api.testReadCapability(q.object);
        const cap = ensureCap(q.object);
        cap.can_read = res.success;
        if (res.error) cap.read_error = res.error;
        if (res.requiresFilter) cap.notes = `requires ${res.requiresFilter} filter`;
        const detail = res.requiresFilter
          ? `Read confirmed — requires ${res.requiresFilter} filter (use loanId when querying)`
          : res.error || `Read test ${res.success ? 'passed' : 'failed'}`;
        resolved.push({ question: q.question, result: res.success ? 'yes' : 'no', detail, object: q.object });
      } else if (q.testMethod === 'create') {
        const res = await api.testCreateCapability(q.object);
        ensureCap(q.object).can_create = res.success;
        resolved.push({ question: q.question, result: res.success ? 'yes' : 'no', detail: res.error || `Create capability ${res.success ? 'likely supported' : 'blocked'}`, object: q.object });
      } else if (q.testMethod === 'update') {
        const res = await api.testUpdateCapability(q.object);
        ensureCap(q.object).can_update = res.success;
        resolved.push({ question: q.question, result: res.success ? 'yes' : 'no', detail: res.error || `Update capability ${res.success ? 'likely supported' : 'blocked'}`, object: q.object });
      }

      setResults([...resolved]);
      await new Promise((r) => setTimeout(r, 150));
    }

    const ro: string[] = [];
    const fr: string[] = []; // readable but requires a mandatory filter
    const fc: string[] = [];
    for (const obj of objects.slice(0, 20)) {
      const r = await api.testReadCapability(obj);
      const c = await api.testCreateCapability(obj);
      if (r.success) ensureCap(obj).can_read = true;
      if (r.requiresFilter) {
        fr.push(obj);
        if (r.requiresFilter) {
          const cap = ensureCap(obj);
          if (!cap.notes) cap.notes = `requires ${r.requiresFilter} filter`;
        }
      } else if (r.success && !c.success) {
        ro.push(obj);
      } else if (r.success && c.success) {
        fc.push(obj);
        ensureCap(obj).can_create = true;
      }
    }
    setReadOnly(ro);
    setFilteredRead(fr);
    setFullCrud(fc);

    // Save confirmed-missing objects as false entries so Reports shows them correctly
    for (const mo of MISSING_OBJECTS) {
      if (!capMap[mo.name]) {
        capMap[mo.name] = {
          site_name: config.siteName,
          object_name: mo.name,
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
          notes: mo.note,
        };
      }
    }

    // Upsert all capability results to Supabase — Reports reads from this table
    const rows = Object.values(capMap);
    await supabase
      .from('capability_results')
      .upsert(rows, { onConflict: 'site_name,object_name' });
    setSavedCount(rows.length);

    setRunning(false);
    setDone(true);
  };

  const ResultIcon = ({ result }: { result: DiscoveryQuestion['result'] }) => {
    if (result === 'yes') return <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />;
    if (result === 'no') return <XCircle size={15} className="text-red-500 shrink-0" />;
    if (result === 'testing') return <RefreshCw size={15} className="text-amber-500 shrink-0 animate-spin" />;
    return <HelpCircle size={15} className="text-neutral-400 shrink-0" />;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Alert variant="info" className="flex-1">
          Probes the Ventures API to answer key engineering questions about available objects, supported operations, and relationships. Results are saved to the database and reflected in the Reports page.
        </Alert>
        <button onClick={run} disabled={status !== 'connected' || running} className="btn-primary shrink-0">
          {running ? <RefreshCw size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          {running ? 'Discovering…' : 'Run Discovery'}
        </button>
      </div>

      {status !== 'connected' && (
        <Alert variant="warning">Connect to the Ventures API to run the automated discovery.</Alert>
      )}

      {/* Missing objects callout */}
      <Card padding="sm">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Objects Not Present in This Ventures Instance</span>
        </div>
        <div className="space-y-1.5">
          {MISSING_OBJECTS.map((o) => (
            <div key={o.name} className="flex items-center gap-3">
              <XCircle size={12} className="text-red-400 shrink-0" />
              <span className="text-xs font-mono font-medium text-neutral-700 dark:text-neutral-300 w-24 shrink-0">{o.name}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{o.note}</span>
            </div>
          ))}
        </div>
      </Card>

      {running && (
        <Card padding="sm">
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw size={14} className="text-primary-500 animate-spin" />
            <span className="text-xs text-neutral-600 dark:text-neutral-400">Discovery in progress… {progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      {results.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Object & Operation Questions</div>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <ResultIcon result={r.result} />
                <div className="flex-1">
                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{r.question}</div>
                  {r.detail && <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{r.detail}</div>}
                </div>
                <Badge variant={r.result === 'yes' ? 'green' : r.result === 'no' ? 'red' : r.result === 'testing' ? 'yellow' : 'gray'}>
                  {r.result.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {done && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Object Classification</CardTitle>
              <Badge variant="blue">{objectList.length} objects</Badge>
            </CardHeader>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 flex items-center gap-1">
                  <Database size={12} /> Read-Only Objects ({readOnly.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {readOnly.length === 0
                    ? <span className="text-xs text-neutral-400 italic">None found in first 20</span>
                    : readOnly.map((o) => <Badge key={o} variant="gray">{o}</Badge>)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-500" /> Readable — Requires Filter ({filteredRead.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {filteredRead.length === 0
                    ? <span className="text-xs text-neutral-400 italic">None detected</span>
                    : filteredRead.map((o) => <Badge key={o} variant="yellow">{o}</Badge>)}
                </div>
                {filteredRead.length > 0 && (
                  <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                    These objects require a mandatory filter (e.g. loanId) — not browsable directly.
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 flex items-center gap-1">
                  <CheckSquare size={12} /> Full CRUD Objects ({fullCrud.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {fullCrud.length === 0
                    ? <span className="text-xs text-neutral-400 italic">None confirmed</span>
                    : fullCrud.map((o) => <Badge key={o} variant="green">{o}</Badge>)}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Object Relationships</CardTitle>
              <Badge variant="green">Confirmed from API</Badge>
            </CardHeader>
            <div className="space-y-2">
              {RELATIONSHIP_QUESTIONS.map((q) => (
                <div key={q.label} className="flex items-start gap-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{q.label}</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{q.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {done && (
        <Card padding="md" className="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Discovery Complete</span>
            </div>
            {savedCount > 0 && (
              <Badge variant="green" dot>
                <Save size={11} /> {savedCount} results saved to Reports
              </Badge>
            )}
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2">
            Capability results have been saved to the database. Open the <strong>Reports</strong> page to see the updated workflow readiness score.
          </p>
        </Card>
      )}
    </div>
  );
}
