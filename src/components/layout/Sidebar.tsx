import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Plug, Search, Database, GitBranch,
  Zap, ScrollText, Bell, PenTool, BarChart3, Settings,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { to: '/',                 label: 'Dashboard',           icon: LayoutDashboard },
  { to: '/connection',       label: 'Connection',          icon: Plug },
  { to: '/explorer',         label: 'API Explorer',        icon: Search },
  { to: '/objects',          label: 'Object Browser',      icon: Database },
  { to: '/workflows',        label: 'Workflow Validator',  icon: GitBranch },
  { to: '/triggers',         label: 'Trigger Builder',     icon: Zap },
  { to: '/notifications',    label: 'Notifications',       icon: Bell },
  { to: '/writeback',        label: 'Writeback Tester',    icon: PenTool },
  { to: '/logs',             label: 'API Logs',            icon: ScrollText },
  { to: '/reports',          label: 'Reports',             icon: BarChart3 },
  { to: '/settings',         label: 'Settings',            icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { status } = useAuth();
  const location = useLocation();

  return (
    <aside className={`relative flex flex-col bg-neutral-900 dark:bg-neutral-950 border-r border-neutral-800 transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'} shrink-0`}>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 h-14 border-b border-neutral-800 overflow-hidden`}>
        <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs">VA</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-white text-xs font-semibold leading-tight truncate">Ventures API Toolkit</div>
            <div className="text-neutral-500 text-[10px] truncate">API Toolkit</div>
          </div>
        )}
      </div>

      {/* Connection dot */}
      {!collapsed && (
        <div className="px-4 py-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className={
              status === 'connected' ? 'status-dot-green' :
              status === 'connecting' || status === 'refreshing' ? 'status-dot-yellow' :
              status === 'error' ? 'status-dot-red' : 'status-dot-gray'
            } />
            <span className="text-neutral-400 text-[11px]">
              {status === 'connected' ? 'Connected' :
               status === 'connecting' ? 'Connecting...' :
               status === 'refreshing' ? 'Refreshing...' :
               status === 'error' ? 'Error' : 'Disconnected'}
            </span>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 mx-2 my-0.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-colors overflow-hidden
                ${active
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                }`}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 flex items-center justify-center text-neutral-300 transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Footer */}
      <div className={`px-3 py-3 border-t border-neutral-800 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className="text-neutral-600 text-[10px] text-center leading-tight">
          {collapsed ? 'v1' : 'Built by PointClick Technologies\nv1.0'}
        </div>
      </div>
    </aside>
  );
}
