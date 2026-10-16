import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { ApiLogEntry } from '../types';
import { supabase } from './supabase';

// Module-level log callback — set by LogContext, read at request time by all instances
let onLogEntry: ((entry: ApiLogEntry) => void) | null = null;
export function setLogCallback(fn: (entry: ApiLogEntry) => void) { onLogEntry = fn; }

export function createApiInstance(baseUrl: string, getToken: () => string | null, getSiteName?: () => string): AxiosInstance {
  const instance = axios.create({ baseURL: baseUrl });

  // Supabase edge function requires the anon key to authenticate the proxy call
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (anonKey) instance.defaults.headers.common['apikey'] = anonKey;

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getToken();
    // Send the opaque session ID in a custom header — the proxy resolves it
    // to the real Ventures JWT server-side, bypassing Supabase header interception.
    if (token) config.headers['X-Session-ID'] = token;
    (config as InternalAxiosRequestConfig & { metadata?: { startTime: number } }).metadata = { startTime: Date.now() };
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      const req = response.config as InternalAxiosRequestConfig & { metadata?: { startTime: number } };
      const duration = req.metadata ? Date.now() - req.metadata.startTime : 0;
      const entry: ApiLogEntry = {
        endpoint: response.config.url || '',
        method: (response.config.method || 'GET').toUpperCase(),
        headers: sanitizeHeaders(response.config.headers as Record<string, string>),
        payload: response.config.data ? tryParse(response.config.data) : undefined,
        response_body: response.data,
        status_code: response.status,
        duration_ms: duration,
        site_name: getSiteName?.() || '',
      };
      persistLog(entry);
      onLogEntry?.(entry);
      return response;
    },
    (error) => {
      const req = error.config as (InternalAxiosRequestConfig & { metadata?: { startTime: number } }) | undefined;
      const duration = req?.metadata ? Date.now() - req.metadata.startTime : 0;
      const entry: ApiLogEntry = {
        endpoint: error.config?.url || '',
        method: (error.config?.method || 'GET').toUpperCase(),
        headers: sanitizeHeaders(error.config?.headers as Record<string, string>),
        payload: error.config?.data ? tryParse(error.config.data) : undefined,
        response_body: error.response?.data,
        status_code: error.response?.status,
        duration_ms: duration,
        error: error.message,
        site_name: getSiteName?.() || '',
      };
      persistLog(entry);
      onLogEntry?.(entry);
      return Promise.reject(error);
    }
  );

  return instance;
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = '[redacted]';
  if (safe['X-Session-ID']) safe['X-Session-ID'] = '[redacted]';
  return safe;
}

function tryParse(val: string): unknown {
  try { return JSON.parse(val); } catch { return val; }
}

async function persistLog(entry: ApiLogEntry) {
  try {
    await supabase.from('api_logs').insert(entry);
  } catch { /* non-critical */ }
}
