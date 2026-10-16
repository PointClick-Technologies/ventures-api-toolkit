import { Sun, Moon, RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLogs } from '../../contexts/LogContext';
import { formatDistanceToNow } from '../../lib/time';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { isDark, toggle } = useTheme();
  const { status, token, config, connect, secondsUntilExpiry } = useAuth();
  const { logs } = useLogs();

  const formatExpiry = (secs: number) => {
    if (secs <= 0) return 'expired';
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <header className="h-14 px-6 flex items-center justify-between bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
      <div>
        <h1 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Log count */}
        {logs.length > 0 && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {logs.length} log{logs.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Token expiry */}
        {status === 'connected' && token && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800">
            <span className="status-dot-green" />
            <span className="text-xs text-neutral-600 dark:text-neutral-300 font-mono">
              {config.siteName} · {formatExpiry(secondsUntilExpiry)}
            </span>
            <button
              onClick={connect}
              title="Refresh token"
              className="ml-1 text-neutral-400 hover:text-primary-500 transition-colors"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

// Re-export helper so Header import stays clean
export { formatDistanceToNow };
