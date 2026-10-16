import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ApiLogEntry } from '../types';
import { setLogCallback } from '../lib/axiosInstance';

interface LogContextValue {
  logs: ApiLogEntry[];
  clearLogs: () => void;
}

const LogContext = createContext<LogContextValue>({ logs: [], clearLogs: () => {} });

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);

  const addLog = useCallback((entry: ApiLogEntry) => {
    setLogs((prev) => [{ ...entry, id: crypto.randomUUID() }, ...prev].slice(0, 500));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // register with axios interceptor
  React.useEffect(() => { setLogCallback(addLog); }, [addLog]);

  return (
    <LogContext.Provider value={{ logs, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLogs() { return useContext(LogContext); }
