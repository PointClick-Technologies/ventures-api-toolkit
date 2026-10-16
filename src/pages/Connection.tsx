import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import { Spinner } from '../components/ui/EmptyState';
import { Plug, RefreshCw, LogOut, Eye, EyeOff, Clock, Shield, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

export default function Connection() {
  const {
    status, token, config, connect, disconnect,
    updateConfig, errorMessage, secondsUntilExpiry, requestPreview,
  } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => { setLocalConfig(config); }, [config]);

  const handleConnect = async () => {
    const prev = config as unknown as Record<string, string>;
    const local = localConfig as unknown as Record<string, string>;
    Object.entries(local).forEach(([k, v]) => {
      if (prev[k] !== v) updateConfig({ [k]: v });
    });
    await connect();
  };

  const statusConfig = {
    connected:    { label: 'Connected',    variant: 'green'  as const },
    connecting:   { label: 'Connecting…',  variant: 'yellow' as const },
    refreshing:   { label: 'Refreshing…',  variant: 'yellow' as const },
    error:        { label: 'Error',        variant: 'red'    as const },
    disconnected: { label: 'Disconnected', variant: 'gray'   as const },
  }[status];

  const formatExpiry = (secs: number) => {
    if (secs <= 0) return 'Expired';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const expiryPct = token ? Math.min(100, Math.max(0, (secondsUntilExpiry / token.expires_in) * 100)) : 0;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Status card */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>Ventures API authentication state</CardDescription>
          </div>
          <Badge variant={statusConfig.variant} dot>{statusConfig.label}</Badge>
        </CardHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-neutral-400" />
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Client</span>
            </div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {config.siteName || <span className="text-neutral-400">—</span>}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-neutral-400" />
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Token Expires</span>
            </div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {status === 'connected' ? formatExpiry(secondsUntilExpiry) : <span className="text-neutral-400">—</span>}
            </div>
            {status === 'connected' && (
              <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${expiryPct > 50 ? 'bg-emerald-500' : expiryPct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${expiryPct}%` }}
                />
              </div>
            )}
          </div>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Plug size={14} className="text-neutral-400" />
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Token Type</span>
            </div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {token?.token_type || <span className="text-neutral-400">—</span>}
            </div>
          </div>
        </div>

        {token && (
          <div className="mt-4 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Session Token</div>
            <div className="mono text-neutral-600 dark:text-neutral-300 truncate">
              {token.access_token}
            </div>
          </div>
        )}
      </Card>

      {/* Error */}
      {errorMessage && (
        <Alert variant="error" title="Authentication Failed">
          <div className="break-all">{errorMessage}</div>
        </Alert>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>Credentials from environment variables. Override here for this session.</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Base URL</label>
              <input
                className="input"
                placeholder="https://api.venturesgo.com"
                value={localConfig.baseUrl}
                onChange={(e) => setLocalConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                Client <span className="text-neutral-400 font-normal">(sent as <code className="mono">client=</code>)</span>
              </label>
              <input
                className="input"
                placeholder="your-site"
                value={localConfig.siteName}
                onChange={(e) => setLocalConfig((c) => ({ ...c, siteName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Username</label>
              <input
                className="input"
                placeholder="apiuser"
                value={localConfig.username}
                onChange={(e) => setLocalConfig((c) => ({ ...c, username: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={localConfig.password}
                  onChange={(e) => setLocalConfig((c) => ({ ...c, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {status === 'connected' ? (
              <>
                <button onClick={handleConnect} className="btn-secondary">
                  <RefreshCw size={14} /> Refresh Token
                </button>
                <button onClick={disconnect} className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <LogOut size={14} /> Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={status === 'connecting' || !localConfig.baseUrl || !localConfig.username}
                className="btn-primary"
              >
                {status === 'connecting' ? <><Spinner size={14} /> Connecting…</> : <><Plug size={14} /> Connect</>}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Request debug panel */}
      <Card padding="none" className="border-dashed">
        <button
          onClick={() => setShowDebug((d) => !d)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-neutral-400" />
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Request Debug</span>
            {requestPreview && <Badge variant="blue" size="sm">Last attempt captured</Badge>}
          </div>
          {showDebug ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
        </button>

        {showDebug && (
          <div className="px-5 pb-5 space-y-3 border-t border-neutral-100 dark:border-neutral-800 pt-4">
            {requestPreview ? (
              <div>
                <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">Request URL (password redacted)</div>
                <pre className="mono text-xs bg-neutral-950 text-neutral-300 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all">
                  GET {requestPreview.url}
                </pre>
              </div>
            ) : (
              <div className="text-xs text-neutral-400 italic">Click Connect to capture the request URL.</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
