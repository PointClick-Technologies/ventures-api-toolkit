import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Ventures API Workflow Validation Toolkit' },
  '/connection': { title: 'Connection Manager', subtitle: 'API authentication and token management' },
  '/explorer': { title: 'API Explorer', subtitle: 'Discover and inspect Ventures API objects' },
  '/objects': { title: 'Object Browser', subtitle: 'Browse, search, and inspect records' },
  '/workflows': { title: 'Workflow Validator', subtitle: 'Test and validate automation workflows' },
  '/triggers': { title: 'Trigger Builder', subtitle: 'Define and store automation trigger logic' },
  '/notifications': { title: 'Notification Simulator', subtitle: 'Preview notifications without sending' },
  '/writeback': { title: 'Writeback Tester', subtitle: 'Test write operations against the API' },
  '/logs': { title: 'API Logs', subtitle: 'Capture and export all API activity' },
  '/reports': { title: 'Reports & Readiness', subtitle: 'Workflow readiness score and CRM configuration output' },
  '/settings': { title: 'Settings', subtitle: 'Site profiles and connection configuration' },
};

export default function Layout() {
  const { pathname } = useLocation();
  const key = Object.keys(pageMeta).find((k) => k !== '/' && pathname.startsWith(k)) ?? '/';
  const meta = pageMeta[key] || pageMeta['/'];

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={meta.title} subtitle={meta.subtitle} />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
