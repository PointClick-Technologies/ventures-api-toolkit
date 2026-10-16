import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { VenturesToken, ConnectionStatus, VenturesConfig } from '../types';
import { AuthService } from '../services/authService';
import { VenturesApiService } from '../services/venturesApi';

interface AuthContextValue {
  status: ConnectionStatus;
  token: VenturesToken | null;
  config: VenturesConfig;
  api: VenturesApiService | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  updateConfig: (c: Partial<VenturesConfig>) => void;
  errorMessage: string | null;
  secondsUntilExpiry: number;
  requestPreview: { url: string } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultConfig: VenturesConfig = {
  baseUrl: import.meta.env.VITE_VENTURES_BASE_URL || '',
  siteName: import.meta.env.VITE_VENTURES_SITE || '',
  username: import.meta.env.VITE_VENTURES_USERNAME || '',
  password: import.meta.env.VITE_VENTURES_PASSWORD || '',
};

// In production (Bolt hosted / any deployment), the Vite dev proxy isn't available.
// All environments route through the Supabase Edge Function proxy instead.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/ventures-proxy`;

function proxyConfig(cfg: VenturesConfig): VenturesConfig {
  return { ...cfg, baseUrl: PROXY_BASE };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [token, setToken] = useState<VenturesToken | null>(null);
  const [config, setConfig] = useState<VenturesConfig>(defaultConfig);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsUntilExpiry, setSecondsUntilExpiry] = useState(0);
  const [api, setApi] = useState<VenturesApiService | null>(null);
  const [requestPreview, setRequestPreview] = useState<{ url: string } | null>(null);
  const authRef = useRef<AuthService | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback((t: VenturesToken) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((t.expires_at - Date.now()) / 1000));
      setSecondsUntilExpiry(secs);
    }, 1000);
  }, []);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage(null);
    try {
      const proxied = proxyConfig(config);
      const svc = new AuthService(proxied);
      authRef.current = svc;
      setRequestPreview(svc.buildRequestPreview());
      svc.setCallbacks(
        (t) => { setToken(t); setStatus('connected'); startCountdown(t); },
        (e) => { setStatus('error'); setErrorMessage(e.message); }
      );
      const t = await svc.authenticate();
      setToken(t);
      setStatus('connected');
      startCountdown(t);
      setApi(new VenturesApiService(
        PROXY_BASE,
        () => authRef.current?.getToken() ?? null,
        () => config.siteName,
      ));
    } catch (e: unknown) {
      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }, [config, startCountdown]);

  const disconnect = useCallback(() => {
    authRef.current?.invalidate();
    setToken(null);
    setStatus('disconnected');
    setApi(null);
    setRequestPreview(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const updateConfig = useCallback((partial: Partial<VenturesConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  return (
    <AuthContext.Provider value={{
      status, token, config, api,
      connect, disconnect, updateConfig,
      errorMessage, secondsUntilExpiry, requestPreview,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
