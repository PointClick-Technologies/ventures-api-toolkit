import { useState, useMemo } from 'react';
import { useLogs } from '../contexts/LogContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import JsonViewer from '../components/ui/JsonViewer';
import { EmptyState } from '../components/ui/EmptyState';
import { ScrollText, Download, Trash2, Search, Eye, Clock, Filter } from 'lucide-react';
import { formatDuration } from '../lib/time';
import type { ApiLogEntry } from '../types';

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_GROUPS = ['ALL', '2xx', '3xx', '4xx', '5xx', 'Error'];

export default function ApiLogs() {
  const { logs, clearLogs } = useLogs();
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewing, setViewing] = useState<ApiLogEntry | null>(null);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const matchSearch = !search ||
        l.endpoint.toLowerCase().includes(search.toLowerCase()) ||
        (l.error || '').toLowerCase().includes(search.toLowerCase());
      const matchMethod = methodFilter === 'ALL' || l.method === methodFilter;
      const matchStatus = statusFilter === 'ALL' ||
        (statusFilter === '2xx' && l.status_code && l.status_code >= 200 && l.status_code < 300) ||
        (statusFilter === '3xx' && l.status_code && l.status_code >= 300 && l.status_code < 400) ||
        (statusFilter === '4xx' && l.status_code && l.status_code >= 400 && l.status_code < 500) ||
        (statusFilter === '5xx' && l.status_code && l.status_code >= 500) ||
        (statusFilter === 'Error' && !l.status_code);
      return matchSearch && matchMethod && matchStatus;
    });
  }, [logs, search, methodFilter, statusFilter]);

  const exportCsv = () => {
    const header = 'timestamp,method,endpoint,status,duration_ms,error';
    const rows = filtered.map((l) =>
      [l.created_at || '', l.method, `"${l.endpoint}"`, l.status_code || '', l.duration_ms || '', `"${l.error || ''}"`].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusVariant = (code?: number): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!code) return 'red';
    if (code < 300) return 'green';
    if (code < 400) return 'yellow';
    return 'red';
  };

  const methodVariant = (method: string): 'green' | 'blue' | 'orange' | 'red' | 'gray' => {
    if (method === 'GET')    return 'green';
    if (method === 'POST')   return 'blue';
    if (method === 'PUT' || method === 'PATCH') return 'orange';
    if (method === 'DELETE') return 'red';
    return 'gray';
  };

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Toolbar */}
      <Card padding="sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input className="input pl-8 text-sm" placeholder="Search endpoint or error…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex items-center gap-1">
            <Filter size={13} className="text-neutral-400" />
            {METHODS.map((m) => (
              <button key={m} onClick={() => setMethodFilter(m)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${methodFilter === m ? 'bg-primary-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}>
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {STATUS_GROUPS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}>
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{filtered.length} entries</span>
            {filtered.length > 0 && (
              <>
                <button onClick={exportCsv} className="btn-secondary text-xs py-1"><Download size={12} /> CSV</button>
                <button onClick={exportJson} className="btn-secondary text-xs py-1"><Download size={12} /> JSON</button>
              </>
            )}
            {logs.length > 0 && (
              <button onClick={clearLogs} className="btn-ghost text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Log table */}
      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title="No logs" description={logs.length === 0 ? 'API calls will appear here once you connect and start exploring.' : 'No entries match your filters.'} />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Method</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Endpoint</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Duration</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Site</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">Error</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-neutral-600 dark:text-neutral-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filtered.map((log, i) => (
                  <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="px-3 py-2">
                      <Badge variant={methodVariant(log.method)}>{log.method}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-700 dark:text-neutral-300 max-w-[320px]">
                      <span className="truncate block">{log.endpoint}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(log.status_code)}>{log.status_code || '—'}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock size={11} className="opacity-50" />
                        {log.duration_ms != null ? formatDuration(log.duration_ms) : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{log.site_name || '—'}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {log.error ? (
                        <span className="text-red-500 truncate block">{log.error}</span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-700">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setViewing(log)} className="btn-ghost p-1">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Log Entry Detail" width="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={methodVariant(viewing.method)}>{viewing.method}</Badge>
              <code className="mono text-sm text-neutral-700 dark:text-neutral-300 flex-1 truncate">{viewing.endpoint}</code>
              <Badge variant={statusVariant(viewing.status_code)}>{viewing.status_code || '—'}</Badge>
              {viewing.duration_ms != null && <span className="text-xs text-neutral-500 font-mono">{formatDuration(viewing.duration_ms)}</span>}
            </div>
            {viewing.error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-mono">{viewing.error}</div>}
            {viewing.headers && (
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Request Headers</div>
                <JsonViewer data={viewing.headers} maxHeight="120px" />
              </div>
            )}
            {!!viewing.payload && (
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Request Payload</div>
                <JsonViewer data={viewing.payload} maxHeight="150px" />
              </div>
            )}
            {!!viewing.response_body && (
              <div>
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Response Body</div>
                <JsonViewer data={viewing.response_body} maxHeight="200px" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
