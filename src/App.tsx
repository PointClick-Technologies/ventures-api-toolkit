import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { LogProvider } from './contexts/LogContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Connection from './pages/Connection';
import ApiExplorer from './pages/ApiExplorer';
import ObjectBrowser from './pages/ObjectBrowser';
import WorkflowValidator from './pages/WorkflowValidator/index';
import TriggerBuilder from './pages/TriggerBuilder';
import NotificationSimulator from './pages/NotificationSimulator';
import WritebackTester from './pages/WritebackTester';
import ApiLogs from './pages/ApiLogs';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LogProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="connection" element={<Connection />} />
                <Route path="explorer" element={<ApiExplorer />} />
                <Route path="objects" element={<ObjectBrowser />} />
                <Route path="workflows" element={<WorkflowValidator />} />
                <Route path="triggers" element={<TriggerBuilder />} />
                <Route path="notifications" element={<NotificationSimulator />} />
                <Route path="writeback" element={<WritebackTester />} />
                <Route path="logs" element={<ApiLogs />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </LogProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
