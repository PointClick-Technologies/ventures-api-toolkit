import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';
import JsonViewer from '../components/ui/JsonViewer';
import { EmptyState, PageSpinner } from '../components/ui/EmptyState';
import type { VenturesObject, ObjectDescribe, ObjectField } from '../types';
import { Search, Database, ChevronRight, CheckCircle, XCircle, Minus, Copy } from 'lucide-react';

export default function ApiExplorer() {
  const { status, api } = useAuth();
  const [objects, setObjects] = useState<VenturesObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [rawModal, setRawModal] = useState(false);
  const [fieldFilter, setFieldFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'connected' || !api) return;
    setLoading(true);
    setError(null);
    api.getObjects()
      .then(setObjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, api]);

  const selectObject = async (name: string) => {
    setSelected(name);
    setDescribe(null);
    setFieldFilter('');
    if (!api) return;
    setDescLoading(true);
    try {
      const d = await api.describeObject(name);
      setDescribe(d);
    } catch { /* object may not have describe */ }
    setDescLoading(false);
  };

  const filteredObjects = objects.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.label || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredFields = describe?.fields?.filter((f) =>
    f.name.toLowerCase().includes(fieldFilter.toLowerCase()) ||
    (f.label || '').toLowerCase().includes(fieldFilter.toLowerCase())
  ) || [];

  const FieldBool = ({ val }: { val: boolean }) =>
    val ? <CheckCircle size={13} className="text-emerald-500" /> : <XCircle size={13} className="text-neutral-300 dark:text-neutral-600" />;

  const typeBadgeVariant = (type: string) => {
    const t = type?.toLowerCase();
    if (t?.includes('string') || t?.includes('text')) return 'blue';
    if (t?.includes('int') || t?.includes('number') || t?.includes('decimal')) return 'orange';
    if (t?.includes('bool')) return 'green';
    if (t?.includes('date')) return 'yellow';
    return 'gray';
  };

  const copyField = (f: ObjectField) => navigator.clipboard.writeText(f.name);

  return (
    <div className="flex gap-6 h-full">
      {/* Object list */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            className="input pl-9"
            placeholder="Search objects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card padding="none" className="flex-1 overflow-hidden flex flex-col">
          {status !== 'connected' ? (
            <EmptyState icon={Database} title="Not connected" description="Connect to the API first." />
          ) : loading ? (
            <PageSpinner />
          ) : error ? (
            <div className="p-4"><Alert variant="error">{error}</Alert></div>
          ) : filteredObjects.length === 0 ? (
            <EmptyState icon={Database} title="No objects found" />
          ) : (
            <div className="overflow-y-auto flex-1">
              <div className="p-2 border-b border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 font-medium px-3">
                {filteredObjects.length} object{filteredObjects.length !== 1 ? 's' : ''}
              </div>
              {filteredObjects.map((obj) => (
                <button
                  key={obj.name}
                  onClick={() => selectObject(obj.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${selected === obj.name ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                >
                  <Database size={12} className="shrink-0 opacity-50" />
                  <span className="flex-1 truncate font-mono text-xs">{obj.name}</span>
                  {selected === obj.name && <ChevronRight size={12} />}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Schema detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={Database} title="Select an object" description="Choose an object from the list to explore its schema." />
          </div>
        ) : (
          <div className="space-y-4">
            <Card padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <Database size={14} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-mono">{selected}</div>
                    {describe?.label && <div className="text-xs text-neutral-500">{describe.label}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {describe && (
                    <>
                      {[
                        { label: 'Create', val: describe.can_create },
                        { label: 'Update', val: describe.can_update },
                        { label: 'Delete', val: describe.can_delete },
                      ].map(({ label, val }) => val !== undefined && (
                        <Badge key={label} variant={val ? 'green' : 'red'}>{label}</Badge>
                      ))}
                      <button onClick={() => setRawModal(true)} className="btn-secondary text-xs py-1 px-2">
                        View Raw
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {descLoading ? (
              <PageSpinner />
            ) : !describe ? (
              <Alert variant="warning">No schema returned for this object. It may not support the describe endpoint.</Alert>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input className="input pl-8 py-1.5 text-xs" placeholder="Filter fields…" value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)} />
                  </div>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{filteredFields.length} of {describe.fields?.length || 0} fields</span>
                </div>

                <Card padding="none" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                          {['Field Name', 'Label', 'Type', 'Required', 'Read Only', 'Writable', 'Searchable', ''].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {filteredFields.map((f) => (
                          <tr key={f.name} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                            <td className="px-3 py-2 font-mono font-medium text-neutral-800 dark:text-neutral-200">{f.name}</td>
                            <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{f.label || <Minus size={12} className="opacity-30" />}</td>
                            <td className="px-3 py-2">
                              <Badge variant={typeBadgeVariant(f.type)}>{f.type || 'unknown'}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center"><FieldBool val={f.required} /></td>
                            <td className="px-3 py-2 text-center"><FieldBool val={f.read_only} /></td>
                            <td className="px-3 py-2 text-center"><FieldBool val={f.writable} /></td>
                            <td className="px-3 py-2 text-center"><FieldBool val={f.searchable} /></td>
                            <td className="px-3 py-2">
                              <button onClick={() => copyField(f)} className="text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300">
                                <Copy size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      <Modal open={rawModal} onClose={() => setRawModal(false)} title={`Raw Schema: ${selected}`} width="lg">
        <JsonViewer data={describe} />
      </Modal>
    </div>
  );
}
