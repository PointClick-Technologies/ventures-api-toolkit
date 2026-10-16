export interface VenturesConfig {
  baseUrl: string;
  siteName: string;
  username: string;
  password: string;
}

export interface VenturesToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number; // timestamp ms
}

export interface VenturesObject {
  name: string;
  label?: string;
  description?: string;
}

export interface ObjectField {
  name: string;
  label?: string;
  type: string;
  required: boolean;
  read_only: boolean;
  writable: boolean;
  searchable: boolean;
  default_value?: unknown;
  max_length?: number;
  options?: string[];
}

export interface SearchField {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  options?: string[];
  reference_to?: string;
}

export interface ObjectDescribe {
  name: string;
  label?: string;
  fields: ObjectField[];
  can_create?: boolean;
  can_update?: boolean;
  can_delete?: boolean;
  search_fields: SearchField[];
  can_sort: boolean;
}

export interface PaginatedResponse<T> {
  records: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ApiLogEntry {
  id?: string;
  created_at?: string;
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  payload?: unknown;
  response_body?: unknown;
  status_code?: number;
  duration_ms?: number;
  error?: string;
  site_name?: string;
}

export type CapabilityStatus = 'supported' | 'blocked' | 'unknown' | 'testing';

export interface CapabilityResult {
  id?: string;
  site_name: string;
  object_name: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  read_error?: string;
  create_error?: string;
  update_error?: string;
  delete_error?: string;
  notes?: string;
}

export interface TriggerDefinition {
  id?: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  data_source: string;
  required_fields: string[];
  condition_field?: string;
  condition_operator?: string;
  condition_value?: string;
  delay_minutes: number;
  notification_type?: string;
  escalation_rule?: string;
  writeback_required: boolean;
  site_name?: string;
  notes?: string;
  enabled?: boolean;
  workflow?: string;
  recipient_type?: string;
  email_subject?: string;
  email_body?: string;
  trigger_event?: string;
}

export interface NotificationLog {
  id?: string;
  created_at?: string;
  trigger_id?: string | null;
  trigger_name?: string;
  recipient?: string;
  recipient_type?: string;
  subject?: string;
  body?: string;
  notification_type?: string;
  status?: string;
  error_message?: string | null;
  provider_id?: string | null;
  context?: Record<string, unknown>;
}

export interface NotificationTemplate {
  id?: string;
  name: string;
  type: 'borrower_email' | 'internal_email' | 'teams' | 'task';
  subject?: string;
  body?: string;
  variables: Record<string, string>;
  site_name?: string;
}

export interface SiteProfile {
  id?: string;
  name: string;
  display_name: string;
  base_url: string;
  site_name: string;
  is_active: boolean;
  last_connected_at?: string;
  notes?: string;
}

export interface WritebackAttempt {
  id?: string;
  created_at?: string;
  operation: string;
  object_name?: string;
  record_id?: string;
  request_payload?: unknown;
  response_body?: unknown;
  status_code?: number;
  success: boolean;
  error?: string;
  site_name?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'refreshing';

export interface DiscoveryQuestion {
  question: string;
  result: 'yes' | 'no' | 'unknown' | 'testing';
  detail?: string;
  object?: string;
}

export interface ReadinessScore {
  object: string;
  read: 'green' | 'yellow' | 'red';
  create: 'green' | 'yellow' | 'red';
  update: 'green' | 'yellow' | 'red';
  delete: 'green' | 'yellow' | 'red';
  blockers: string[];
  score: number;
}

// ── Document Request Workflow Types ──

export type WorkflowDocState =
  | 'incomplete'
  | 'uploaded'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'unknown';

export interface DocumentRequest {
  requestId: string;
  loanId?: string;
  applicationId?: string;
  documentTypeId?: string;
  documentName: string;
  description?: string;
  entityName?: string;
  entityApplicant?: string;
  requestStatus: string;
  requestedDate?: string;
  dueDate?: string;
  thirdPartyUpload?: boolean;
  reviewStatus?: string;
  comments?: string;
  rawRecord: Record<string, unknown>;
}

export interface UploadedDocument {
  loanDocumentId: string;
  loanId?: string;
  applicationId?: string;
  documentTypeId?: string;
  documentCategory?: string;
  documentType?: string;
  fileName: string;
  uploadDate?: string;
  uploadedBy?: string;
  entityName?: string;
  relatedRequestId?: string;
  reviewStatus?: string;
  rawRecord: Record<string, unknown>;
}

export type MatchMethod =
  | 'direct_id'
  | 'document_type_id'
  | 'category_id'
  | 'exact_name'
  | 'fuzzy_name'
  | 'none';

export interface DocumentMatchResult {
  request: DocumentRequest;
  uploadedDocs: UploadedDocument[];
  matchMethod: MatchMethod;
  workflowState: WorkflowDocState;
  daysOutstanding: number;
  lastUploadDate?: string;
  recommendedAction: string;
  fuzzyMatchLabel?: string;
}

export type DocumentSource = 'request_object' | 'document_type_catalog' | 'loan_document_types';

export interface DocumentDebugInfo {
  requestObjectName: string;
  requestObjectEndpoint: string;
  requestObjectFields: string[];
  documentSource: DocumentSource;
  uploadedObjectName: string;
  uploadedObjectEndpoint: string;
  rawRequestResponse: Record<string, unknown>[];
  rawUploadResponse: Record<string, unknown>[];
  missingFields: string[];
  apiLimitations: string[];
  matchDetails: Array<{ requestName: string; matchMethod: MatchMethod; detail: string }>;
}
