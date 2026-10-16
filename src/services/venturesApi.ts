import { createApiInstance } from '../lib/axiosInstance';
import type { AxiosInstance } from 'axios';
import type {
  VenturesObject, ObjectDescribe, ObjectField, PaginatedResponse, SearchField,
} from '../types';

export class VenturesApiService {
  private http: AxiosInstance;

  constructor(baseUrl: string, getToken: () => string | null, getSiteName?: () => string) {
    this.http = createApiInstance(baseUrl, getToken, getSiteName);
  }

  private v4(path: string) {
    return `/api/v4${path}`;
  }

  // Ventures object endpoints use lowercase names
  private objectPath(objectName: string, suffix = '') {
    return this.v4(`/objects/${objectName.toLowerCase()}${suffix}`);
  }

  async getObjects(): Promise<VenturesObject[]> {
    const res = await this.http.get(this.v4('/objects'));
    const d = res.data as { result?: VenturesObject[] };
    return Array.isArray(d.result) ? d.result : [];
  }

  async describeObject(objectName: string): Promise<ObjectDescribe> {
    const res = await this.http.get(this.objectPath(objectName, '/describe'));
    const d = res.data as {
      result?: {
        name?: string;
        endpoints?: Array<{
          name: string;
          httpMethod: string;
          requestFields?: Array<{
            name: string;
            type: string;
            required?: boolean;
            length?: number;
            description?: string;
            picklistOptions?: string[];
            referenceTo?: string;
          }>;
        }>;
      };
    };

    const endpoints = d.result?.endpoints ?? [];
    const createEp = endpoints.find(e => e.name === 'create');
    const listEp = endpoints.find(e => e.name === 'list');

    const fields: ObjectField[] = (createEp?.requestFields ?? []).map(f => ({
      name: f.name,
      type: f.type,
      required: f.required ?? false,
      read_only: false,
      writable: true,
      searchable: false,
      max_length: f.length,
      options: f.picklistOptions,
    }));

    const search_fields: SearchField[] = (listEp?.requestFields ?? []).map(f => ({
      name: f.name,
      type: f.type,
      description: f.description,
      required: f.required ?? false,
      options: f.picklistOptions,
      reference_to: f.referenceTo,
    }));

    const can_sort = !!(listEp?.requestFields ?? []).some(f => f.name === 'sort');

    return {
      name: d.result?.name ?? objectName,
      fields,
      can_create: !!createEp,
      can_update: endpoints.some(e => e.name === 'update' || (e.httpMethod === 'POST' && e.name !== 'create')),
      can_delete: endpoints.some(e => e.name === 'delete' || e.httpMethod === 'DELETE'),
      search_fields,
      can_sort,
    };
  }

  async getRecords(
    objectName: string,
    params: {
      page?: number;
      page_size?: number;
      search?: string;
      filters?: Record<string, string>;
      sort?: string;
      sort_dir?: 'asc' | 'desc';
    } = {}
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const qp: Record<string, string | number> = {
      page: params.page ?? 1,
      recordsPerPage: params.page_size ?? 25,
    };
    if (params.sort) {
      qp.sort = params.sort;
      if (params.sort_dir) qp.sort_dir = params.sort_dir;
    }
    if (params.filters) Object.assign(qp, params.filters);

    // Ventures record listing is at /objects/{name}/list, not /objects/{name}
    const res = await this.http.get(this.objectPath(objectName, '/list'), { params: qp });
    const raw = res.data as {
      result: Record<string, unknown>[] | null;
      totalCount?: number;
      page?: number;
      recordsPerPage?: number;
      totalPages?: number;
    };

    const records = Array.isArray(raw.result) ? raw.result : [];
    const total = raw.totalCount ?? records.length;
    const page = raw.page ?? 1;
    const page_size = raw.recordsPerPage ?? (params.page_size ?? 25);
    const totalPages = raw.totalPages ?? 1;

    return { records, total, page, page_size, has_more: page < totalPages };
  }

  async getRecord(objectName: string, id: string): Promise<Record<string, unknown>> {
    const res = await this.http.get(this.objectPath(objectName, `/${id}`));
    const d = res.data as { result?: Record<string, unknown> };
    return d.result ?? (res.data as Record<string, unknown>);
  }

  async createRecord(objectName: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.http.post(this.objectPath(objectName), data);
    const d = res.data as { result?: Record<string, unknown> };
    return d.result ?? (res.data as Record<string, unknown>);
  }

  // Ventures uses POST (not PUT) for updates
  async updateRecord(objectName: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.http.post(this.objectPath(objectName, `/${id}`), data);
    const d = res.data as { result?: Record<string, unknown> };
    return d.result ?? (res.data as Record<string, unknown>);
  }

  async deleteRecord(objectName: string, id: string): Promise<void> {
    await this.http.delete(this.objectPath(objectName, `/${id}`));
  }

  async testReadCapability(objectName: string): Promise<{ success: boolean; error?: string; requiresFilter?: string }> {
    try {
      await this.http.get(this.objectPath(objectName, '/list'), { params: { page: 1, recordsPerPage: 1 } });
      return { success: true };
    } catch (e: unknown) {
      const axiosErr = e as { response?: { status?: number; data?: { messages?: string[] } }; message: string };
      const status = axiosErr.response?.status;
      const messages: string[] = axiosErr.response?.data?.messages ?? [];

      // A 400 "X is required" means the object IS readable — it just enforces a mandatory
      // filter param. Fundamentally different from 403/404 (blocked/missing). Treat as success.
      if (status === 400 && messages.some((m) => /required/i.test(m))) {
        const match = messages[0]?.match(/parameter\s+(\w+)\s+is required/i);
        return { success: true, requiresFilter: match?.[1] ?? 'filter' };
      }

      return { success: false, error: String(axiosErr.message) };
    }
  }

  async testCreateCapability(objectName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.http.options(this.objectPath(objectName));
      return { success: true };
    } catch (e: unknown) {
      const msg = String(e instanceof Error ? e.message : e);
      const status = (e as { response?: { status: number } }).response?.status;
      if (status === 405 || status === 403) return { success: false, error: msg };
      return { success: true };
    }
  }

  async testUpdateCapability(objectName: string): Promise<{ success: boolean; error?: string }> {
    return this.testCreateCapability(objectName);
  }

  async testDeleteCapability(objectName: string): Promise<{ success: boolean; error?: string }> {
    return this.testCreateCapability(objectName);
  }
}
