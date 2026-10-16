import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLogs } from '../contexts/LogContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import {
  Plug, Search, Database, GitBranch, Zap, ScrollText,
  BarChart3, ArrowRight, Clock, AlertTriangle, CheckCircle2, Activity
} from 'lucide-react';

const modules = [
  { to: '/connection',    title: 'Connection Manager',    desc: 'Authenticate and monitor API token',             icon: Plug,        status: 'ready' },
  { to: '/explorer',      title: 'API Explorer',          desc: 'Discover objects and schema fields',             icon: Search,      status: 'ready' },
  { to: '/objects',       title: 'Object Browser',        desc: 'Browse records with search and filtering',       icon: Database,    status: 'ready' },
  { to: '/workflows',     title: 'Workflow Validator',    desc: '3 workflow prototypes with trigger testing',     icon: GitBranch,   status: 'ready' },
  { to: '/triggers',      title: 'Trigger Builder',       desc: 'Create and store trigger definitions',           icon: Zap,         status: 'ready' },
  { to: '/logs',          title: 'API Logs',              desc: 'Capture all requests with export',               icon: ScrollText,  status: 'ready' },
  { to: '/reports',       title: 'Reports & Readiness',   desc: 'CRM config output and readiness score',          icon: BarChart3,   status: 'ready' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { status, config } = useAuth();
  const { logs } = useLogs();

  const recentLogs = logs.slice(0, 5);
  const errorCount = logs.filter((l) => l.status_code && l.status_code >= 400).length;
  const avgDuration = logs.length
    ? Math.round(logs.reduce((s, l) => s + (l.duration_ms || 0), 0) / logs.length)
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Overview banner */}
      <div className="rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-primary-200 mb-1 uppercase tracking-wider">Your Organization · Ventures API</div>
            <h2 className="text-xl font-semibold mb-2">Ventures API Validation Toolkit</h2>
            <p className="text-primary-200 text-sm max-w-xl">
              Engineering proof-of-concept environment for validating Ventures API capabilities before building production automation. Not intended to replace Ventures.
            </p>
          </div>
          <div className="shrink-0 ml-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              status === 'connected'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                : 'bg-white/10 text-primary-200 border border-white/20'
            }`}>
              <span className={status === 'connected' ? 'status-dot-green' : 'status-dot-gray'} />
              {status === 'connected' ? `Connected · ${config.siteName}` : 'Not connected'}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'API Calls', value: logs.length, icon: Activity, color: 'text-primary-500' },
          { label: 'Errors', value: errorCount, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Avg Latency', value: logs.length ? `${avgDuration}ms` : '—', icon: Clock, color: 'text-amber-500' },
          { label: 'Modules', value: modules.length, icon: CheckCircle2, color: 'text-emerald-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} padding="md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{label}</div>
              </div>
              <Icon size={20} className={`${color} opacity-80`} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modules grid */}
        <div className="lg:col-span-2">
          <div className="section-label">Toolkit Modules</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {modules.map(({ to, title, desc, icon: Icon }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="group text-left p-4 card hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                    <Icon size={16} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                      {title}
                      <ArrowRight size={12} className="text-neutral-400 group-hover:text-primary-500 transition-colors ml-auto shrink-0" />
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <div className="section-label">Recent API Activity</div>
          <Card padding="none">
            {recentLogs.length === 0 ? (
              <div className="py-10 text-center text-neutral-400 dark:text-neutral-600 text-sm">
                No activity yet.<br />Connect to start logging.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Badge
                      variant={
                        !log.status_code ? 'gray' :
                        log.status_code < 300 ? 'green' :
                        log.status_code < 400 ? 'yellow' : 'red'
                      }
                    >
                      {log.status_code || '—'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mono truncate">{log.method} {log.endpoint}</div>
                      <div className="text-[11px] text-neutral-400">{log.duration_ms}ms</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {recentLogs.length > 0 && (
              <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
                <button onClick={() => navigate('/logs')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                  View all logs <ArrowRight size={11} />
                </button>
              </div>
            )}
          </Card>

          {/* Quick start */}
          {status !== 'connected' && (
            <div className="mt-4">
              <div className="section-label">Quick Start</div>
              <Card padding="md" className="border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex gap-3">
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-300">API not connected</div>
                    <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 mb-3">Configure credentials and connect to start exploring the Ventures API.</div>
                    <button onClick={() => navigate('/connection')} className="btn-primary text-xs py-1.5">
                      Go to Connection <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* About */}
      <Card padding="md" className="border-dashed">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-neutral-400">VA</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">About This Toolkit</div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-3xl">
              Built by PointClick Technologies.
              This tool validates what is technically possible with the Ventures API before building production automation.
              Designed to be reusable across any organization using a Ventures-based platform by switching the site configuration profile.
              No emails are sent, no production data is modified without explicit intent, and all credentials are managed via environment variables.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
