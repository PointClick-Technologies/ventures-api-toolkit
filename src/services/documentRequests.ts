import type {
  DocumentRequest,
  UploadedDocument,
  DocumentMatchResult,
  WorkflowDocState,
  MatchMethod,
} from '../types';

// ── API Discovery ──

const DOCUMENT_REQUEST_CANDIDATES = [
  'DocumentRequest',
  'LoanDocumentRequest',
  'RequiredDocument',
  'DocumentChecklist',
  'LoanRequiredDocument',
  'ApplicationDocument',
  'DocumentTracking',
  'DocTracker',
];

export interface DiscoveredRequestObject {
  objectName: string;
  endpoint: string;
  fields: string[];
  filterField: string;
  limitations: string[];
}

export async function discoverDocumentRequestObject(
  api: {
    getObjects: () => Promise<Array<{ name: string }>>;
    describeObject: (name: string) => Promise<{
      fields: Array<{ name: string; type: string }>;
      search_fields: Array<{ name: string; type: string; reference_to?: string }>;
    }>;
    testReadCapability: (name: string) => Promise<{ success: boolean; requiresFilter?: string }>;
  }
): Promise<DiscoveredRequestObject | null> {
  let allObjects: string[] = [];
  try {
    const obs = await api.getObjects();
    allObjects = obs.map((o) => o.name);
  } catch {
    return null;
  }

  // Find any object whose name contains "document" and "request" or "checklist" or "required"
  const lowerAll = allObjects.map((o) => o.toLowerCase());
  const candidates: string[] = [];

  for (const candidate of DOCUMENT_REQUEST_CANDIDATES) {
    const idx = lowerAll.indexOf(candidate.toLowerCase());
    if (idx >= 0) candidates.push(allObjects[idx]);
  }

  // Also search for objects with "document" in the name that aren't LoanDocument
  for (const obj of allObjects) {
    const lower = obj.toLowerCase();
    if (
      lower.includes('document') &&
      lower !== 'loandocument' &&
      !candidates.includes(obj)
    ) {
      // Check if it has "request", "required", "checklist", or "tracking"
      if (
        lower.includes('request') ||
        lower.includes('required') ||
        lower.includes('checklist') ||
        lower.includes('tracking') ||
        lower.includes('tracker')
      ) {
        candidates.push(obj);
      }
    }
  }

  // Also look for objects containing "doc" but not "loandocument"
  for (const obj of allObjects) {
    const lower = obj.toLowerCase();
    if (
      lower.startsWith('doc') &&
      lower !== 'loandocument' &&
      lower !== 'document' &&
      !candidates.includes(obj)
    ) {
      candidates.push(obj);
    }
  }

  // Try each candidate: describe it and check for document-request-like fields
  for (const candidate of candidates) {
    try {
      const desc = await api.describeObject(candidate);
      const fieldNames = desc.fields.map((f) => f.name.toLowerCase());
      const searchFieldNames = desc.search_fields.map((f) => f.name.toLowerCase());

      // Must have some document-type field and a status field
      const hasDocType =
        fieldNames.some((f) => f.includes('documenttype') || f.includes('documentname') || f.includes('doctype') || f.includes('docname') || f.includes('name') || f.includes('description'));
      const hasStatus =
        fieldNames.some((f) => f.includes('status') || f.includes('state') || f.includes('review'));

      // Must have a loan or application link
      const hasLoanLink =
        fieldNames.some((f) => f.includes('loanid') || f.includes('applicationid') || f.includes('loan')) ||
        searchFieldNames.some((f) => f.includes('loanid') || f.includes('applicationid'));

      if (hasDocType && hasStatus && hasLoanLink) {
        // Determine the filter field for loan/app ID
        let filterField = 'loanId';
        const sf = desc.search_fields.find(
          (f) =>
            f.name.toLowerCase().includes('loanid') ||
            f.name.toLowerCase().includes('applicationid')
        );
        if (sf) filterField = sf.name;

        const readTest = await api.testReadCapability(candidate);
        if (readTest.requiresFilter) {
          filterField = readTest.requiresFilter;
        }

        return {
          objectName: candidate,
          endpoint: `/api/v4/objects/${candidate.toLowerCase()}/list?${filterField}=`,
          fields: desc.fields.map((f) => f.name),
          filterField,
          limitations: readTest.requiresFilter
            ? [`Requires ${readTest.requiresFilter} filter to list records`]
            : [],
        };
      }
    } catch {
      // continue to next candidate
    }
  }

  return null;
}

// ── DocumentType Catalog Discovery (fallback when no per-loan request object exists) ──

export interface DiscoveredDocumentTypeCatalog {
  objectName: string;
  endpoint: string;
  fields: string[];
}

export async function discoverDocumentTypeCatalog(
  api: {
    getObjects: () => Promise<Array<{ name: string }>>;
    describeObject: (name: string) => Promise<{
      fields: Array<{ name: string; type: string }>;
    }>;
  }
): Promise<DiscoveredDocumentTypeCatalog | null> {
  let allObjects: string[] = [];
  try {
    const obs = await api.getObjects();
    allObjects = obs.map((o) => o.name);
  } catch {
    return null;
  }

  const lowerAll = allObjects.map((o) => o.toLowerCase());
  const idx = lowerAll.indexOf('documenttype');
  if (idx < 0) return null;

  const objectName = allObjects[idx];
  try {
    const desc = await api.describeObject(objectName);
    return {
      objectName,
      endpoint: `/api/v4/objects/${objectName.toLowerCase()}/list`,
      fields: desc.fields.map((f) => f.name),
    };
  } catch {
    return null;
  }
}

export async function fetchDocumentTypeCatalog(
  api: {
    getRecords: (
      objectName: string,
      params: { page?: number; page_size?: number; filters?: Record<string, string> }
    ) => Promise<{ records: Record<string, unknown>[]; total: number }>;
  },
  objectName: string
): Promise<{ typeMap: Map<string, string>; rawRecords: Record<string, unknown>[] }> {
  const result = await api.getRecords(objectName, {
    page: 1,
    page_size: 200,
  });

  // Build a lookup from documentTypeId → display name
  const typeMap = new Map<string, string>();
  for (const r of result.records) {
    const id = String(r.id ?? r.uuid ?? '');
    const name = String(r.name ?? r.documentName ?? r.description ?? '').trim();
    if (id && name) typeMap.set(id, name);
    // Also map by lowercase name for fuzzy reverse lookup
    if (name) typeMap.set(name.toLowerCase(), name);
  }
  return { typeMap, rawRecords: result.records };
}

// Query DocumentType filtered by loanId to get only the document types linked
// to a specific loan. Ventures requires loanId for most loan-scoped objects
// (LoanDocument, LoanPartner, Contact, etc.), and DocumentType follows the same
// pattern when browsing documents for a specific loan.
//
// Validation: we fetch the unfiltered catalog count as a baseline, then compare
// the filtered result count. If filtered < unfiltered, the filter worked. If
// they're equal, the API ignored the filter and returned the full catalog —
// we signal this to the caller so it can fall back to the full-catalog approach.
export async function fetchLoanDocumentTypes(
  api: {
    getRecords: (
      objectName: string,
      params: { page?: number; page_size?: number; filters?: Record<string, string> }
    ) => Promise<{ records: Record<string, unknown>[]; total: number }>;
  },
  objectName: string,
  loanId: string
): Promise<
  | { records: Record<string, unknown>[]; filterUsed: string; totalCatalogCount: number }
  | null
> {
  // Step 1: get the unfiltered catalog count as a baseline for validation
  let totalCatalogCount = 0;
  try {
    const baseline = await api.getRecords(objectName, {
      page: 1,
      page_size: 1,
    });
    totalCatalogCount = baseline.total;
  } catch {
    // If we can't get a baseline, we can't validate — but still try the filter
  }

  // Step 2: try loanId filter first (the primary Ventures pattern for loan-scoped objects)
  const attempts: Array<{ field: string; value: string }> = [
    { field: 'loanId', value: loanId },
  ];

  for (const attempt of attempts) {
    try {
      const result = await api.getRecords(objectName, {
        page: 1,
        page_size: 200,
        filters: { [attempt.field]: attempt.value },
      });

      // Validate: if we have a baseline and the filtered count is less than
      // the unfiltered count, the filter worked correctly.
      if (totalCatalogCount > 0 && result.records.length < totalCatalogCount) {
        return {
          records: result.records,
          filterUsed: attempt.field,
          totalCatalogCount,
        };
      }

      // If no baseline was available but we got results, trust them
      if (totalCatalogCount === 0 && result.records.length > 0) {
        return {
          records: result.records,
          filterUsed: attempt.field,
          totalCatalogCount: result.records.length,
        };
      }

      // If filtered count equals total catalog count, the filter was likely
      // ignored — don't use these results (caller will fall back)
      if (totalCatalogCount > 0 && result.records.length >= totalCatalogCount) {
        // Filter was ignored — try next attempt or fall through
        continue;
      }

      // Got 0 results with a working filter (loan has no document types linked)
      if (totalCatalogCount > 0 && result.records.length === 0 && result.total === 0) {
        return {
          records: [],
          filterUsed: attempt.field,
          totalCatalogCount,
        };
      }
    } catch {
      // Filter not supported or error — try next attempt
      continue;
    }
  }

  return null;
}

// Build document requests from loan-scoped DocumentType records.
// Each DocumentType becomes a required document entry. Status is determined by
// cross-referencing against uploaded LoanDocuments: if a matching upload exists,
// use its review status; otherwise the document is "Incomplete".
export function buildRequestsFromDocTypes(
  docTypeRecords: Record<string, unknown>[],
  uploads: UploadedDocument[],
  typeMap: Map<string, string>
): DocumentRequest[] {
  return docTypeRecords.map((raw) => {
    const s = (key: string): string | undefined => {
      const v = raw[key];
      if (v === null || v === undefined || v === '') return undefined;
      return String(v).trim();
    };

    const docTypeId = s('documentTypeId') ?? s('docTypeId') ?? s('id') ?? '';
    let docName = s('name') ?? s('documentName') ?? s('description') ?? s('title') ?? 'Unknown Document';
    // Enrich with catalog lookup if the ID maps to a better name
    if (docTypeId && typeMap.has(docTypeId)) {
      docName = typeMap.get(docTypeId)!;
    }

    // Check if there's a matching upload for this document type
    const matchingUpload = uploads.find(
      (u) =>
        (u.documentTypeId && u.documentTypeId === docTypeId) ||
        (u.documentType && u.documentType.toLowerCase() === docName.toLowerCase())
    );

    const requestStatus = matchingUpload
      ? (matchingUpload.reviewStatus ?? 'Uploaded')
      : (s('status') ?? s('reviewStatus') ?? 'Incomplete');

    return {
      requestId: String(raw.id ?? raw.uuid ?? ''),
      loanId: s('loanId'),
      applicationId: s('applicationId') ?? s('logNumber'),
      documentTypeId: docTypeId,
      documentName: docName,
      description: s('description') ?? s('comments'),
      entityName: s('entityName') ?? s('borrowerName'),
      requestStatus,
      requestedDate: s('requestedDate') ?? s('addedDate') ?? s('createdDate'),
      dueDate: s('dueDate') ?? s('requiredDate'),
      reviewStatus: matchingUpload?.reviewStatus ?? s('reviewStatus'),
      comments: s('comments') ?? s('notes'),
      rawRecord: raw,
    } as DocumentRequest;
  });
}

// Build document requests from the actual uploaded LoanDocument records for this loan.
// Each upload becomes a "document" entry with its real review status from the API.
// The DocumentType catalog is used only to enrich display names.
export function buildRequestsFromUploads(
  uploads: UploadedDocument[],
  typeMap: Map<string, string>
): DocumentRequest[] {
  return uploads.map((u) => {
    // Try to get a better display name from the DocumentType catalog
    let docName = u.documentType ?? u.fileName ?? 'Unknown Document';
    if (u.documentTypeId && typeMap.has(u.documentTypeId)) {
      docName = typeMap.get(u.documentTypeId)!;
    } else if (u.documentType) {
      const lower = u.documentType.toLowerCase();
      if (typeMap.has(lower)) {
        docName = typeMap.get(lower)!;
      }
    }

    return {
      requestId: u.relatedRequestId ?? u.loanDocumentId,
      loanId: u.loanId,
      documentTypeId: u.documentTypeId,
      documentName: docName,
      entityName: u.entityName,
      requestStatus: u.reviewStatus ?? 'Uploaded',
      requestedDate: u.uploadDate,
      reviewStatus: u.reviewStatus,
      rawRecord: u.rawRecord,
    } as DocumentRequest;
  });
}

// ── Fetch Document Requests ──

export async function fetchDocumentRequests(
  api: {
    getRecords: (
      objectName: string,
      params: { page?: number; page_size?: number; filters?: Record<string, string> }
    ) => Promise<{ records: Record<string, unknown>[]; total: number }>;
  },
  objectName: string,
  filterField: string,
  loanId: string
): Promise<{ requests: DocumentRequest[]; rawRecords: Record<string, unknown>[] }> {
  const result = await api.getRecords(objectName, {
    page: 1,
    page_size: 100,
    filters: { [filterField]: loanId },
  });

  const requests: DocumentRequest[] = result.records.map((r) => mapDocumentRequest(r));
  return { requests, rawRecords: result.records };
}

function mapDocumentRequest(raw: Record<string, unknown>): DocumentRequest {
  const s = (key: string): string | undefined => {
    const v = raw[key];
    if (v === null || v === undefined || v === '') return undefined;
    return String(v).trim();
  };

  return {
    requestId: String(raw.id ?? raw.uuid ?? raw.requestId ?? ''),
    loanId: s('loanId'),
    applicationId: s('applicationId'),
    documentTypeId: s('documentTypeId') ?? s('documentType') ?? s('docTypeId'),
    documentName: s('documentName') ?? s('name') ?? s('description') ?? s('documentType') ?? s('title') ?? 'Unknown Document',
    description: s('description') ?? s('comments') ?? s('instructions'),
    entityName: s('entityName') ?? s('applicantName') ?? s('borrowerName') ?? s('referenceName'),
    entityApplicant: s('entityApplicant') ?? s('applicant') ?? s('entity'),
    requestStatus: s('requestStatus') ?? s('status') ?? s('reviewStatus') ?? s('state') ?? 'Unknown',
    requestedDate: s('requestedDate') ?? s('addedDate') ?? s('createdDate') ?? s('requestDate'),
    dueDate: s('dueDate') ?? s('requiredDate') ?? s('deadline'),
    thirdPartyUpload: raw['thirdPartyUpload'] === true || raw['allowThirdParty'] === true,
    reviewStatus: s('reviewStatus') ?? s('reviewState'),
    comments: s('comments') ?? s('instructions') ?? s('notes'),
    rawRecord: raw,
  };
}

// ── Fetch Uploaded Documents ──

export async function fetchUploadedDocuments(
  api: {
    getRecords: (
      objectName: string,
      params: { page?: number; page_size?: number; filters?: Record<string, string> }
    ) => Promise<{ records: Record<string, unknown>[]; total: number }>;
  },
  loanId: string
): Promise<{ uploads: UploadedDocument[]; rawRecords: Record<string, unknown>[] }> {
  const result = await api.getRecords('LoanDocument', {
    page: 1,
    page_size: 100,
    filters: { loanId },
  });

  const uploads: UploadedDocument[] = result.records.map((r) => mapUploadedDocument(r));
  return { uploads, rawRecords: result.records };
}

function mapUploadedDocument(raw: Record<string, unknown>): UploadedDocument {
  const s = (key: string): string | undefined => {
    const v = raw[key];
    if (v === null || v === undefined || v === '') return undefined;
    return String(v).trim();
  };

  return {
    loanDocumentId: String(raw.id ?? raw.uuid ?? ''),
    loanId: s('loanId'),
    applicationId: s('applicationId'),
    documentTypeId: s('documentTypeId') ?? s('documentType') ?? s('docTypeId'),
    documentCategory: s('documentCategory') ?? s('category') ?? s('docCategory'),
    documentType: s('documentType') ?? s('type') ?? s('documentName') ?? s('name'),
    fileName: s('fileName') ?? s('filename') ?? s('name') ?? s('title') ?? '',
    uploadDate: s('addedDate') ?? s('uploadDate') ?? s('createdDate') ?? s('dateAdded'),
    uploadedBy: s('addedBy') ?? s('uploadedBy') ?? s('createdBy') ?? s('owner'),
    entityName: s('entityName') ?? s('applicantName') ?? s('borrowerName'),
    relatedRequestId: s('documentRequestId') ?? s('requestId') ?? s('relatedRequestId'),
    reviewStatus: s('reviewStatus') ?? s('status') ?? s('approvalStatus'),
    rawRecord: raw,
  };
}

// ── Status Mapping ──

const STATUS_MAP: Record<string, WorkflowDocState> = {
  // Incomplete / Missing
  'incomplete': 'incomplete',
  'missing': 'incomplete',
  'not uploaded': 'incomplete',
  'notuploaded': 'incomplete',
  'pending': 'incomplete',
  'open': 'incomplete',
  'requested': 'incomplete',
  'outstanding': 'incomplete',
  'not received': 'incomplete',
  'notreceived': 'incomplete',
  'awaiting': 'incomplete',

  // Uploaded
  'uploaded': 'uploaded',
  'received': 'uploaded',
  'submitted': 'uploaded',
  'provided': 'uploaded',

  // Pending Review
  'pending review': 'pending_review',
  'pendingreview': 'pending_review',
  'in review': 'pending_review',
  'inreview': 'pending_review',
  'under review': 'pending_review',
  'underreview': 'pending_review',
  'reviewing': 'pending_review',

  // Accepted / Complete
  'accepted': 'accepted',
  'complete': 'accepted',
  'completed': 'accepted',
  'approved': 'accepted',
  'verified': 'accepted',
  'reviewed': 'accepted',
  'passed': 'accepted',

  // Rejected / Needs Correction
  'rejected': 'rejected',
  'needs correction': 'rejected',
  'needscorrection': 'rejected',
  'correction needed': 'rejected',
  'correctionneeded': 'rejected',
  'resubmit': 'rejected',
  'resubmission': 'rejected',
  'failed': 'rejected',
  'declined': 'rejected',
};

export function mapWorkflowState(venturesStatus: string): WorkflowDocState {
  const normalized = venturesStatus.toLowerCase().trim();
  if (STATUS_MAP[normalized]) return STATUS_MAP[normalized];
  // Partial match
  for (const key of Object.keys(STATUS_MAP)) {
    if (normalized.includes(key)) return STATUS_MAP[key];
  }
  return 'unknown';
}

export function workflowStateLabel(state: WorkflowDocState): string {
  const labels: Record<WorkflowDocState, string> = {
    incomplete: 'Incomplete / Missing',
    uploaded: 'Uploaded',
    pending_review: 'Pending Review',
    accepted: 'Accepted / Complete',
    rejected: 'Rejected / Needs Correction',
    unknown: 'Unknown',
  };
  return labels[state];
}

export function workflowStateBadgeVariant(
  state: WorkflowDocState
): 'red' | 'blue' | 'yellow' | 'green' | 'orange' | 'gray' {
  const map: Record<WorkflowDocState, 'red' | 'blue' | 'yellow' | 'green' | 'orange' | 'gray'> = {
    incomplete: 'red',
    uploaded: 'blue',
    pending_review: 'yellow',
    accepted: 'green',
    rejected: 'orange',
    unknown: 'gray',
  };
  return map[state];
}

// ── Matching Logic ──

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Check if one contains the other (for partial names like "Tax Returns" vs "Tax Returns (2yr)")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Token overlap: at least 60% of tokens in the shorter string appear in the longer
  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  const shorter = tokensA.size <= tokensB.size ? tokensA : tokensB;
  const longer = tokensA.size > tokensB.size ? tokensA : tokensB;
  if (shorter.size === 0) return false;
  let overlap = 0;
  for (const t of shorter) {
    if (longer.has(t)) overlap++;
  }
  return overlap / shorter.size >= 0.6;
}

export function matchDocuments(
  requests: DocumentRequest[],
  uploads: UploadedDocument[]
): DocumentMatchResult[] {
  return requests.map((req) => {
    const matchingUploads: UploadedDocument[] = [];
    let matchMethod: MatchMethod = 'none';

    for (const upload of uploads) {
      // 1. Direct request-document relationship ID
      if (upload.relatedRequestId && upload.relatedRequestId === req.requestId) {
        matchingUploads.push(upload);
        matchMethod = 'direct_id';
        continue;
      }
      // 2. Document type ID
      if (
        req.documentTypeId &&
        upload.documentTypeId &&
        req.documentTypeId === upload.documentTypeId
      ) {
        matchingUploads.push(upload);
        if (matchMethod !== 'direct_id') matchMethod = 'document_type_id';
        continue;
      }
      // 3. Document category ID — if category matches request's document type
      if (
        req.documentTypeId &&
        upload.documentCategory &&
        normalizeName(req.documentTypeId) === normalizeName(upload.documentCategory)
      ) {
        matchingUploads.push(upload);
        if (matchMethod === 'none' || matchMethod === 'fuzzy_name' || matchMethod === 'exact_name') {
          matchMethod = 'category_id';
        }
        continue;
      }
      // 4. Exact normalized document name
      if (
        req.documentName &&
        upload.documentType &&
        normalizeName(req.documentName) === normalizeName(upload.documentType)
      ) {
        matchingUploads.push(upload);
        if (matchMethod === 'none' || matchMethod === 'fuzzy_name') {
          matchMethod = 'exact_name';
        }
        continue;
      }
      // 5. Fuzzy name matching (final fallback)
      if (
        req.documentName &&
        upload.documentType &&
        fuzzyMatch(req.documentName, upload.documentType)
      ) {
        matchingUploads.push(upload);
        if (matchMethod === 'none') {
          matchMethod = 'fuzzy_name';
        }
        continue;
      }
    }

    // Determine workflow state
    let workflowState: WorkflowDocState;
    if (matchingUploads.length === 0) {
      // No upload — use the request status
      workflowState = mapWorkflowState(req.requestStatus);
      if (workflowState === 'uploaded' || workflowState === 'accepted' || workflowState === 'pending_review') {
        // If status says uploaded but we found no match, trust the status but note it
        workflowState = mapWorkflowState(req.requestStatus);
      }
    } else {
      // Has upload(s) — prefer the review status from the upload, fall back to request status
      const uploadReviewStatus = matchingUploads[0].reviewStatus ?? req.requestStatus;
      const mapped = mapWorkflowState(uploadReviewStatus);
      // If the upload review status is unknown, check the request status
      workflowState = mapped === 'unknown' ? mapWorkflowState(req.requestStatus) : mapped;
      // If still unknown but we have uploads, call it "uploaded"
      if (workflowState === 'unknown') workflowState = 'uploaded';
    }

    // Days outstanding
    const refDate = req.requestedDate ?? req.dueDate;
    let daysOutstanding = 0;
    if (refDate) {
      const d = new Date(refDate);
      if (!isNaN(d.getTime())) {
        daysOutstanding = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      }
    }

    // Last upload date
    const lastUploadDate = matchingUploads
      .map((u) => u.uploadDate)
      .filter(Boolean)
      .sort()
      .pop();

    // Recommended action
    const recommendedAction = getRecommendedAction(workflowState);

    const result: DocumentMatchResult = {
      request: req,
      uploadedDocs: matchingUploads,
      matchMethod,
      workflowState,
      daysOutstanding,
      lastUploadDate,
      recommendedAction,
    };

    if (matchMethod === 'fuzzy_name') {
      result.fuzzyMatchLabel = `AI/fuzzy match: "${req.documentName}" ~ "${matchingUploads[0]?.documentType ?? ''}"`;
    }

    return result;
  });
}

export function getRecommendedAction(state: WorkflowDocState): string {
  const actions: Record<WorkflowDocState, string> = {
    incomplete: 'Borrower Reminder',
    uploaded: 'None — awaiting review',
    pending_review: 'Internal Review',
    accepted: 'None — complete',
    rejected: 'Request Correction',
    unknown: 'Manual Review',
  };
  return actions[state];
}

// ── Summary Stats ──

export interface DocSummaryStats {
  total: number;
  incomplete: number;
  pendingReview: number;
  accepted: number;
  rejected: number;
  uploaded: number;
  unknown: number;
}

export function computeSummaryStats(matches: DocumentMatchResult[]): DocSummaryStats {
  const stats: DocSummaryStats = {
    total: matches.length,
    incomplete: 0,
    pendingReview: 0,
    accepted: 0,
    rejected: 0,
    uploaded: 0,
    unknown: 0,
  };
  for (const m of matches) {
    switch (m.workflowState) {
      case 'incomplete': stats.incomplete++; break;
      case 'pending_review': stats.pendingReview++; break;
      case 'accepted': stats.accepted++; break;
      case 'rejected': stats.rejected++; break;
      case 'uploaded': stats.uploaded++; break;
      case 'unknown': stats.unknown++; break;
    }
  }
  return stats;
}

// ── Simulated Document Request Data ──

export function getSimulatedDocumentRequests(): DocumentRequest[] {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString().split('T')[0];

  return [
    {
      requestId: 'sim-req-001',
      loanId: 'sim',
      documentName: 'Business Balance Sheet',
      entityName: 'Sample Borrower LLC',
      requestStatus: 'Incomplete',
      requestedDate: daysAgo(12),
      reviewStatus: 'Incomplete',
      comments: 'Required for credit analysis',
      rawRecord: {},
    },
    {
      requestId: 'sim-req-002',
      loanId: 'sim',
      documentName: 'Business Debt Schedule',
      entityName: 'Sample Borrower LLC',
      requestStatus: 'Pending Review',
      requestedDate: daysAgo(8),
      reviewStatus: 'Pending Review',
      comments: 'All current debt obligations',
      rawRecord: {},
    },
    {
      requestId: 'sim-req-003',
      loanId: 'sim',
      documentName: 'Personal Tax Returns',
      entityName: 'Sample Guarantor',
      requestStatus: 'Pending Review',
      requestedDate: daysAgo(10),
      reviewStatus: 'Pending Review',
      comments: '2 years personal returns for guarantor',
      rawRecord: {},
    },
    {
      requestId: 'sim-req-004',
      loanId: 'sim',
      documentName: 'Business Plan',
      entityName: 'Sample Borrower LLC',
      requestStatus: 'Accepted',
      requestedDate: daysAgo(20),
      reviewStatus: 'Accepted',
      comments: 'Projections and market analysis',
      rawRecord: {},
    },
    {
      requestId: 'sim-req-005',
      loanId: 'sim',
      documentName: 'Articles of Incorporation',
      entityName: 'Sample Borrower LLC',
      requestStatus: 'Rejected',
      requestedDate: daysAgo(15),
      reviewStatus: 'Rejected',
      comments: 'Filed document is outdated — need current version',
      rawRecord: {},
    },
  ];
}

export function getSimulatedUploadedDocuments(): UploadedDocument[] {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString().split('T')[0];

  return [
    {
      loanDocumentId: 'sim-up-001',
      loanId: 'sim',
      documentType: 'Business Debt Schedule',
      fileName: 'sample_debt_schedule_2024.xlsx',
      uploadDate: daysAgo(5),
      uploadedBy: 'Loan Officer (BDO)',
      reviewStatus: 'Pending Review',
      rawRecord: {},
    },
    {
      loanDocumentId: 'sim-up-002',
      loanId: 'sim',
      documentType: 'Personal Tax Returns',
      fileName: 'sample_guarantor_tax_2022_2023.pdf',
      uploadDate: daysAgo(4),
      uploadedBy: 'Sample Guarantor',
      reviewStatus: 'Pending Review',
      rawRecord: {},
    },
    {
      loanDocumentId: 'sim-up-003',
      loanId: 'sim',
      documentType: 'Business Plan',
      fileName: 'sample_business_plan_v2.pdf',
      uploadDate: daysAgo(18),
      uploadedBy: 'Loan Officer (BDO)',
      reviewStatus: 'Accepted',
      rawRecord: {},
    },
    {
      loanDocumentId: 'sim-up-004',
      loanId: 'sim',
      documentType: 'Articles of Incorporation',
      fileName: 'articles_2020_filing.pdf',
      uploadDate: daysAgo(12),
      uploadedBy: 'Sample Guarantor',
      reviewStatus: 'Rejected',
      rawRecord: {},
    },
  ];
}

// ── Match Method Labels ──

export function matchMethodLabel(method: MatchMethod): string {
  const labels: Record<MatchMethod, string> = {
    direct_id: 'Direct ID',
    document_type_id: 'Document Type ID',
    category_id: 'Category ID',
    exact_name: 'Exact Name Match',
    fuzzy_name: 'AI/Fuzzy Name Match',
    none: 'No Match',
  };
  return labels[method];
}

// ── Expected Fields (for debug panel) ──

export const EXPECTED_REQUEST_FIELDS = [
  'requestId',
  'loanId',
  'documentTypeId',
  'documentName',
  'entityName',
  'requestStatus',
  'requestedDate',
  'dueDate',
  'reviewStatus',
  'comments',
];

export const EXPECTED_UPLOAD_FIELDS = [
  'loanDocumentId',
  'loanId',
  'documentType',
  'fileName',
  'uploadDate',
  'uploadedBy',
  'reviewStatus',
];

export function findMissingFields(
  actualFields: string[],
  expectedFields: string[]
): string[] {
  const lowerActual = actualFields.map((f) => f.toLowerCase());
  return expectedFields.filter(
    (e) => !lowerActual.some((a) => a.includes(e.toLowerCase()) || e.toLowerCase().includes(a))
  );
}
