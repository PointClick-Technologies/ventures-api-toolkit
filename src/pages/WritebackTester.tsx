import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import JsonViewer from '../components/ui/JsonViewer';
import { Spinner } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import type { WritebackAttempt } from '../types';
import { Send, CheckCircle2, XCircle } from 'lucide-react';

type Operation = 'create_note' | 'update_status' | 'update_substatus' | 'create_followup';

interface FieldConfig {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  isId?: boolean; // if true, this field goes into the URL (not the payload)
}

interface OpConfig {
  label: string;
  object: string;
  method: 'POST' | 'PUT' | 'PATCH';
  description: string;
  fields: FieldConfig[];
}

const OPERATIONS: Record<Operation, OpConfig> = {
  create_note: {
    label: 'Create LoanNote',
    object: 'LoanNote',
    method: 'POST',
    description: 'Create a note on a loan record via the LoanNote object (confirmed present in API).',
    fields: [
      { name: 'loanId',    label: 'Loan ID (numeric)',  placeholder: '1971' },
      { name: 'note',      label: 'Note Text',           placeholder: 'Contacted borrower regarding missing documents…' },
      { name: 'noteType',  label: 'Note Type',           placeholder: 'Contact' },
    ],
  },
  update_status: {
    label: 'Update Loan Status',
    object: 'Loan',
    method: 'PATCH',
    description: 'Update the loanStatus field on a Loan record (POST to /loan/{id} internally).',
    fields: [
      { name: 'record_id',   label: 'Loan ID (numeric)',   placeholder: '1971', isId: true },
      { name: 'loanStatus',  label: 'New loanStatus',      placeholder: 'In Process' },
    ],
  },
  update_substatus: {
    label: 'Update Loan SubStatus',
    object: 'Loan',
    method: 'PATCH',
    description: 'Update the loanSubStatus field on a Loan record.',
    fields: [
      { name: 'record_id',      label: 'Loan ID (numeric)',   placeholder: '1971', isId: true },
      { name: 'loanSubStatus',  label: 'New loanSubStatus',   placeholder: 'Current' },
    ],
  },
  create_followup: {
    label: 'Create Follow-up Note',
    object: 'LoanNote',
    method: 'POST',
    description: 'Create a follow-up LoanNote to document outreach attempts.',
    fields: [
      { name: 'loanId',    label: 'Loan ID (numeric)',  placeholder: '1971' },
      { name: 'note',      label: 'Follow-up Note',     placeholder: 'Left voicemail. Will follow up in 3 days.' },
      { name: 'noteType',  label: 'Note Type',          placeholder: 'Follow-Up' },
    ],
  },
};

export default function WritebackTester() {
  const { api, config, status } = useAuth();
  const [operation, setOperation] = useState<Operation>('create_note');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WritebackAttempt | null>(null);
  const [history, setHistory] = useState<WritebackAttempt[]>([]);

  const op = OPERATIONS[operation];
  const setField = (k: string, v: string) => setFieldValues((prev) => ({ ...prev, [k]: v }));

  const buildPayload = () => {
    const payload: Record<string, string> = {};
    // Exclude isId fields — those go in the URL, not the request body
    op.fields.forEach((f) => { if (!f.isId && fieldValues[f.name]) payload[f.name] = fieldValues[f.name]; });
    return payload;
  };

  const run = async () => {
    if (!api) return;
    setRunning(true);
    setResult(null);

    const payload = buildPayload();
    // For update operations (non-POST), the ID field goes in the URL not the payload
    const idField = op.fields.find((f) => f.isId);
    const recordId = fieldValues[idField?.name ?? op.fields[0].name] || '';
    let attempt: WritebackAttempt = {
      operation,
      object_name: op.object,
      record_id: recordId,
      request_payload: payload,
      site_name: config.siteName,
      success: false,
    };

    try {
      let res: Record<string, unknown>;
      if (op.method === 'POST') {
        res = await api.createRecord(op.object, payload);
      } else {
        res = await api.updateRecord(op.object, recordId, payload);
      }
      attempt = {
        ...attempt,
        response_body: res,
        status_code: 200,
        success: true,
      };
    } catch (e: unknown) {
      const err = e as { response?: { status: number; data: unknown }; message: string };
      attempt = {
        ...attempt,
        response_body: err.response?.data,
        status_code: err.response?.status,
        error: err.message,
        success: false,
      };
    }

    setResult(attempt);
    setHistory((prev) => [attempt, ...prev].slice(0, 20));

    // persist
    await supabase.from('writeback_attempts').insert(attempt);
    setRunning(false);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl space-y-5">
      <Alert variant="warning" title="Writeback Tester — Safe Mode">
        Each test is submitted once against the configured Ventures endpoint. Results are not retried automatically. Confirm you are using a sandbox site before writing data.
      </Alert>

      <Alert variant="info">
        Operations updated to use confirmed Ventures objects: <strong>LoanNote</strong> (for notes/follow-ups) and <strong>Loan</strong> (for status updates). The original Note, Application, Tickler, and Task objects do not exist in this Ventures instance.
      </Alert>

      {status !== 'connected' && (
        <Alert variant="info">Connect to the Ventures API to enable writeback testing.</Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Operation selector + form */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operation</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(OPERATIONS) as [Operation, OpConfig][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => { setOperation(key); setFieldValues({}); setResult(null); }}
                  className={`p-3 rounded-lg border text-left text-xs font-medium transition-all ${operation === key ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'}`}
                >
                  <div className="font-semibold mb-0.5">{cfg.label}</div>
                  <div className="text-[10px] opacity-70">{cfg.method} /{cfg.object}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{op.label}</CardTitle>
              <Badge variant="blue">{op.method}</Badge>
            </CardHeader>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">{op.description}</p>
            <div className="space-y-3">
              {op.fields.map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">{f.label}</label>
                  {f.name.toLowerCase().includes('text') || f.name === 'notes' ? (
                    <textarea
                      className="input"
                      rows={3}
                      placeholder={f.placeholder}
                      value={fieldValues[f.name] || ''}
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  ) : (
                    <input
                      type={f.type || 'text'}
                      className="input"
                      placeholder={f.type === 'date' ? today : f.placeholder}
                      value={fieldValues[f.name] || ''}
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                onClick={run}
                disabled={running || status !== 'connected'}
                className="btn-primary w-full"
              >
                {running ? <Spinner size={14} /> : <Send size={14} />}
                {running ? 'Submitting…' : `Submit ${op.method} Request`}
              </button>
            </div>
          </Card>
        </div>

        {/* Result panel */}
        <div className="space-y-4">
          {/* Request preview */}
          <Card>
            <CardHeader>
              <CardTitle>Request Preview</CardTitle>
              <Badge variant="gray" size="sm">{op.method} /objects/{op.object}{op.method !== 'POST' && '/{id}'}</Badge>
            </CardHeader>
            <JsonViewer data={{ method: op.method, object: op.object, payload: buildPayload() }} maxHeight="180px" />
          </Card>

          {/* Result */}
          {result && (
            <Card className={`border-2 ${result.success ? 'border-emerald-400' : 'border-red-400'}`}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {result.success
                    ? <CheckCircle2 size={16} className="text-emerald-500" />
                    : <XCircle size={16} className="text-red-500" />}
                  <CardTitle>{result.success ? 'Success' : 'Failed'}</CardTitle>
                </div>
                <Badge variant={result.success ? 'green' : 'red'}>
                  {result.status_code || 'No status'}
                </Badge>
              </CardHeader>
              {result.error && (
                <Alert variant="error" className="mb-3">{result.error}</Alert>
              )}
              {!!result.response_body && (
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Response Body</div>
                  <JsonViewer data={result.response_body} maxHeight="200px" />
                </div>
              )}
            </Card>
          )}

          {/* History */}
          {history.length > 0 && (
            <Card padding="none">
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                Recent Attempts
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {history.slice(0, 5).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    {h.success
                      ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                      : <XCircle size={13} className="text-red-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{h.operation.replace('_', ' ').toUpperCase()}</div>
                      {h.error && <div className="text-[11px] text-red-500 truncate">{h.error}</div>}
                    </div>
                    <Badge variant={h.success ? 'green' : 'red'} size="sm">{h.status_code || '—'}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
