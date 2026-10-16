import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import JsonViewer from '../components/ui/JsonViewer';
import Alert from '../components/ui/Alert';
import { EmptyState, PageSpinner, Spinner } from '../components/ui/EmptyState';
import type { VenturesObject, PaginatedResponse, ObjectDescribe } from '../types';
import {
  Search, Database, ChevronLeft, ChevronRight, Copy,
  Eye, Code2, ChevronsUpDown, ArrowUp, ArrowDown, RefreshCw, Filter, X,
} from 'lucide-react';

const PAGE_SIZES = [10, 25, 50, 100];

export default function ObjectBrowser() {
  const { status, api } = useAuth();
  const [objects, setObjects] = useState<VenturesObject[]>([]);
  const [objLoading, setObjLoading] = useState(false);
  const [selectedObj, setSelectedObj] = useState('');
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [records, setRecords] = useState<PaginatedResponse<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [clientFilter, setClientFilter] = useState('');
  const [sort, setSort] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewRecord, setViewRecord] = useState<Record<string, unknown> | null>(null);
  const [jsonRecord, setJsonRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== 'connected' || !api) return;
    setObjLoading(true);
    api.getObjects().then(setObjects).finally(() => setObjLoading(false));
  }, [status, api]);

  const loadRecords = useCallback(async () => {
    if (!api || !selectedObj) return;
    setLoading(true);
    setError(null);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filterValues).filter(([, v]) => v.trim() !== '')
      );
      const res = await api.getRecords(selectedObj, {
        page, page_size: pageSize,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
        sort: describe?.can_sort && sort ? sort : undefined,
        sort_dir: describe?.can_sort && sort ? sortDir : undefined,
      });
      setRecords(res);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { messages?: string[] }; status?: number }; message: string };
      const apiMessages = axiosErr.response?.data?.messages;
      if (apiMessages?.length) {
        setError(`${axiosErr.message} — API says: "${apiMessages.join('; ')}"`);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [api, selectedObj, page, pageSize, filterValues, sort, sortDir, describe]);

  const loadDescribe = useCallback(async () => {
    if (!api || !selectedObj) return;
    setDescLoading(true);
    try {
      const d = await api.describeObject(selectedObj);
      setDescribe(d);
    } catch {
      setDescribe(null);
    }
    setDescLoading(false);
  }, [api, selectedObj]);

  useEffect(() => {
    if (selectedObj) {
      setRecords(null);
      setFilterValues({});
      setClientFilter('');
      setSort('');
      setPage(1);
      loadDescribe();
    } else {
      setDescribe(null);
    }
  }, [selectedObj, loadDescribe]);

  useEffect(() => { if (selectedObj) loadRecords(); }, [loadRecords, selectedObj]);

  const applyFilters = () => { setPage(1); loadRecords(); };
  const clearFilters = () => {
    setFilterValues({});
    setPage(1);
    setTimeout(() => loadRecords(), 0);
  };
  const handleSort = (col: string) => {
    if (!describe?.can_sort) return;
    if (sort === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setSortDir('asc'); }
  };

  const copyJson = (rec: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(rec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const columns = records?.records?.[0] ? Object.keys(records.records[0]).slice(0, 8) : [];

  const filteredRecords = useMemo(() => {
    if (!records || !clientFilter.trim()) return records?.records ?? [];
    const q = clientFilter.toLowerCase();
    return (records.records ?? []).filter((rec) =>
      Object.entries(rec).some(([key, val]) => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'object') return false;
        return key.toLowerCase().includes(q) || String(val).toLowerCase().includes(q);
      })
    );
  }, [records, clientFilter]);

  const hasActiveFilters = Object.values(filterValues).some((v) => v.trim() !== '');

  return (
    <div className="space-y-4 max-w-full">
      {/* Object selector */}
      <Card padding="sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap">Object</label>
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedObj}
              onChange={(e) => { setSelectedObj(e.target.value); }}
            >
              <option value="">Select object…</option>
              {objects.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
            {objLoading && <Spinner size={14} className="text-neutral-400" />}
          </div>

          {selectedObj && (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="relative flex-1 max-w-sm">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    className="input pl-8 py-1.5 text-sm"
                    placeholder="Filter loaded records…"
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <label className="text-xs text-neutral-500 dark:text-neutral-400">Per page</label>
                <select
                  className="input py-1 text-xs w-16"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {PAGE_SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <button onClick={loadRecords} className="btn-ghost" title="Refresh">
                  <RefreshCw size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Server-side filters from describe */}
      {selectedObj && descLoading ? (
        <Card padding="sm"><div className="flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} /> Loading schema…</div></Card>
      ) : describe && describe.search_fields.length > 0 ? (
        <Card padding="sm">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              <Filter size={12} />
              <span>API Filters</span>
              <span className="text-neutral-400 dark:text-neutral-500 font-normal">— server-side, reduces result count</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {describe.search_fields.map((sf) => (
                <div key={sf.name} className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap" title={sf.description}>
                    {sf.name}
                  </label>
                  {sf.options && sf.options.length > 0 ? (
                    <select
                      className="input py-1 text-xs w-36"
                      value={filterValues[sf.name] ?? ''}
                      onChange={(e) => setFilterValues((prev) => ({ ...prev, [sf.name]: e.target.value }))}
                    >
                      <option value="">Any…</option>
                      {sf.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input py-1 text-xs w-36"
                      placeholder={sf.reference_to ? `${sf.reference_to} ID` : sf.type === 'string' ? 'Text…' : 'Value…'}
                      value={filterValues[sf.name] ?? ''}
                      onChange={(e) => setFilterValues((prev) => ({ ...prev, [sf.name]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                    />
                  )}
                </div>
              ))}
              <button onClick={applyFilters} className="btn-secondary py-1 text-xs">Apply</button>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="btn-ghost py-1 text-xs flex items-center gap-1">
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Records table */}
      {status !== 'connected' ? (
        <EmptyState icon={Database} title="Not connected" description="Connect to browse object records." />
      ) : !selectedObj ? (
        <EmptyState icon={Database} title="Select an object" description="Choose an object above to start browsing records." />
      ) : loading ? (
        <PageSpinner />
      ) : error ? (
        <Alert variant="error" title="Failed to load records">{error}</Alert>
      ) : !records || filteredRecords.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No records"
          description={hasActiveFilters || clientFilter ? 'No records match your filters.' : 'This object has no records.'}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400">
                      <button
                        onClick={() => handleSort(col)}
                        disabled={!describe?.can_sort}
                        className={`flex items-center gap-1 ${describe?.can_sort ? 'hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="font-mono">{col}</span>
                        {describe?.can_sort && (
                          sort === col ? (
                            sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                          ) : <ChevronsUpDown size={11} className="opacity-30" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold text-neutral-600 dark:text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredRecords.map((rec, i) => (
                  <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-neutral-700 dark:text-neutral-300 max-w-[200px]">
                        <span className="truncate block">
                          {rec[col] === null || rec[col] === undefined
                            ? <span className="text-neutral-300 dark:text-neutral-600 italic">null</span>
                            : typeof rec[col] === 'boolean'
                              ? <Badge variant={rec[col] ? 'green' : 'red'}>{String(rec[col])}</Badge>
                              : String(rec[col]).substring(0, 80)}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewRecord(rec)} className="btn-ghost p-1" title="View">
                          <Eye size={13} />
                        </button>
                        <button onClick={() => setJsonRecord(rec)} className="btn-ghost p-1" title="Inspect JSON">
                          <Code2 size={13} />
                        </button>
                        <button onClick={() => copyJson(rec)} className="btn-ghost p-1" title="Copy JSON">
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {clientFilter
                ? `${filteredRecords.length} of ${records.total > 0 ? records.total : records.records.length} (filtered on page)`
                : records.total > 0
                  ? `${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, records.total)} of ${records.total}`
                  : `${records.records.length} records`}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost p-1 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-neutral-600 dark:text-neutral-400 px-2">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!records.has_more && records.records.length < pageSize}
                className="btn-ghost p-1 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {copied && (
        <div className="fixed bottom-4 right-4 bg-neutral-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg animate-slide-in">
          Copied to clipboard
        </div>
      )}

      {/* View record modal */}
      <Modal open={!!viewRecord} onClose={() => setViewRecord(null)} title="Record Detail" width="lg">
        {viewRecord && (
          <div className="space-y-2">
            {Object.entries(viewRecord).map(([k, v]) => (
              <div key={k} className="flex items-start gap-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <div className="w-40 shrink-0 text-xs font-mono font-medium text-neutral-600 dark:text-neutral-400">{k}</div>
                <div className="flex-1 text-xs text-neutral-800 dark:text-neutral-200 break-all">
                  {v === null ? <span className="italic text-neutral-300 dark:text-neutral-600">null</span> :
                   typeof v === 'object' ? <JsonViewer data={v} maxHeight="120px" /> : String(v)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* JSON inspect modal */}
      <Modal open={!!jsonRecord} onClose={() => setJsonRecord(null)} title="Raw JSON" width="lg">
        {jsonRecord && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => copyJson(jsonRecord)} className="btn-secondary text-xs py-1">
                <Copy size={12} /> Copy
              </button>
            </div>
            <JsonViewer data={jsonRecord} maxHeight="500px" />
          </div>
        )}
      </Modal>
    </div>
  );
}
