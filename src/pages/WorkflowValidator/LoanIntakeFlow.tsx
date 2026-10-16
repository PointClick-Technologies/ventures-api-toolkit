import { useState, useMemo, useEffect, useCallback } from 'react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import JsonViewer from '../../components/ui/JsonViewer';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type {
  TriggerDefinition, DocumentRequest, UploadedDocument,
  DocumentMatchResult, DocumentDebugInfo, DocumentSource, WorkflowDocState,
} from '../../types';
import {
  sendEmail, renderTemplate, evaluateTrigger, resolveRecipient,
  type TriggerContext,
} from '../../services/notificationService';
import {
  discoverDocumentRequestObject, fetchDocumentRequests, fetchUploadedDocuments,
  discoverDocumentTypeCatalog, fetchDocumentTypeCatalog, fetchLoanDocumentTypes,
  buildRequestsFromDocTypes, buildRequestsFromUploads,
  matchDocuments, computeSummaryStats, getSimulatedDocumentRequests,
  getSimulatedUploadedDocuments, workflowStateLabel,
  workflowStateBadgeVariant, matchMethodLabel, findMissingFields,
  EXPECTED_REQUEST_FIELDS, EXPECTED_UPLOAD_FIELDS,
  type DiscoveredRequestObject, type DiscoveredDocumentTypeCatalog, type DocSummaryStats,
} from '../../services/documentRequests';
import {
  Search, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  FileText, User, Calendar, Clock, ChevronDown, ChevronRight,
  Wifi, WifiOff, Mail, Tag, Activity, Bell, TrendingUp,
  Settings2, ShieldCheck, Code2, RefreshCw, Info,
  Sparkles, Zap, Power, Bug, TableIcon, AlertOctagon,
} from 'lucide-react';
import {
  FIELD_CONFIGS, mapApplicationRecord,
  type MappedApplicationData,
} from './fieldMappings';

interface TriggerResult {
  fires: boolean;
  borrowerReminder: boolean;
  internalReminder: boolean;
  reasons: string[];
  triggerName?: string;
  emailSent?: boolean;
  emailError?: string;
  emailRecipient?: string;
  perDocReasons?: Array<{ name: string; state: WorkflowDocState; action: string }>;
}

interface EmailSendResult {
  success: boolean;
  message: string;
  recipient?: string;
}

interface ClassificationResult {
  documentId: string;
  matchedCategory: string | null;
  confidence: number;
  source: 'rule' | 'llm' | 'unverified';
  reason: string;
  documentType: string;
  fileName: string;
}

// Actual Ventures loanStatus picklist values observed from the API
const STATUSES = ['Active', 'Funded', 'Approved', 'Withdrawn', 'Declined', 'Closed', 'In Process', 'Documents Pending'];

function statusBadgeVariant(s: string): 'yellow' | 'green' | 'red' | 'blue' {
  if (s === 'Documents Pending' || s === 'In Process') return 'yellow';
  if (s === 'Approved' || s === 'Funded') return 'green';
  if (s === 'Declined' || s === 'Withdrawn' || s === 'Closed') return 'red';
  return 'blue';
}

export default function LoanIntakeFlow() {
  const { api, status: authStatus } = useAuth();
  const isConnected = authStatus === 'connected';

  const [mode, setMode] = useState<'simulated' | 'live'>('simulated');
  const isLive = mode === 'live';

  // Live mode — raw records
  const [logNumber, setLogNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [rawLoanRecord, setRawLoanRecord] = useState<Record<string, unknown> | null>(null);
  const [rawContactRecord, setRawContactRecord] = useState<Record<string, unknown> | null>(null);
  const [mergedRecord, setMergedRecord] = useState<Record<string, unknown> | null>(null);
  const [mappedData, setMappedData] = useState<MappedApplicationData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMeta, setLoadMeta] = useState<{ ts: string; loanEndpoint: string; contactEndpoint?: string; partnerEndpoint?: string; docsEndpoint?: string } | null>(null);
  const [loanDocuments, setLoanDocuments] = useState<Array<{ id: number; documentType: string; fileName: string; addedDate: string }> | null>(null);

  // AI-assisted document classification
  const [classifications, setClassifications] = useState<ClassificationResult[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classificationOverrides, setClassificationOverrides] = useState<Record<string, string | null>>({});

  // Field mapping overrides
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [mappingOpen, setMappingOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'loan' | 'contact' | 'documents'>('loan');

  // Document requests (real or simulated)
  const [, setDocRequests] = useState<DocumentRequest[]>([]);
  const [docUploads, setDocUploads] = useState<UploadedDocument[]>([]);
  const [matchResults, setMatchResults] = useState<DocumentMatchResult[]>([]);
  const [discoveredRequestObj, setDiscoveredRequestObj] = useState<DiscoveredRequestObject | null>(null);
  const [discoveredDocTypeCatalog, setDiscoveredDocTypeCatalog] = useState<DiscoveredDocumentTypeCatalog | null>(null);
  const [documentSource, setDocumentSource] = useState<DocumentSource>('request_object');
  const [debugInfo, setDebugInfo] = useState<DocumentDebugInfo | null>(null);
  const [reviewSla, setReviewSla] = useState(3);

  // Simulated mode
  const [simStatus, setSimStatus] = useState('Documents Pending');
  const [simBdo, setSimBdo] = useState('Loan Officer Name');
  const [simBorrowerName, setSimBorrowerName] = useState('Sample Borrower LLC');
  const [simBorrowerEmail, setSimBorrowerEmail] = useState('borrower@example.com');
  const [submissionDate, setSubmissionDate] = useState('2026-06-01');
  const [lastActivity, setLastActivity] = useState('2026-06-10');
  const [threshold, setThreshold] = useState(7);
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);

  // Trigger Builder integration
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [selectedTriggerId, setSelectedTriggerId] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailSendResult | null>(null);

  const hasLiveData = isLive && mappedData !== null;

  const selectedTrigger = triggers.find((t) => t.id === selectedTriggerId) || null;

  const loadTriggers = useCallback(async () => {
    const { data } = await supabase
      .from('trigger_definitions')
      .select('*')
      .eq('workflow', 'loan_intake')
      .eq('enabled', true)
      .order('created_at', { ascending: false });
    setTriggers(data || []);
  }, []);

  useEffect(() => { loadTriggers(); }, [loadTriggers]);

  // Load simulated document requests when in simulated mode
  useEffect(() => {
    if (!isLive) {
      const simReqs = getSimulatedDocumentRequests();
      const simUploads = getSimulatedUploadedDocuments();
      setDocRequests(simReqs);
      setDocUploads(simUploads);
      setMatchResults(matchDocuments(simReqs, simUploads));
    } else {
      setDocRequests([]);
      setDocUploads([]);
      setMatchResults([]);
    }
  }, [isLive]);

  const handleOverrideChange = (key: string, val: string) => {
    const next = { ...fieldOverrides, [key]: val };
    setFieldOverrides(next);
    if (mergedRecord) setMappedData(mapApplicationRecord(mergedRecord, next));
  };

  const classifyDocuments = async (
    loanId: string,
    docs: Array<{ id: number; documentType: string; fileName: string }>,
  ) => {
    setClassifying(true);
    setClassifyError(null);
    setClassifications([]);
    setClassificationOverrides({});

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-classify`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          loanId,
          documents: docs.map((d) => ({
            id: String(d.id),
            documentType: d.documentType,
            fileName: d.fileName,
          })),
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Classification failed (${response.status}): ${errBody}`);
      }

      const data = await response.json();
      setClassifications((data.classifications as ClassificationResult[]) ?? []);
    } catch (e: unknown) {
      setClassifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setClassifying(false);
    }
  };

  const load = async () => {
    if (!api || !logNumber.trim()) return;
    setLoading(true);
    setLoadError(null);
    setRawLoanRecord(null);
    setRawContactRecord(null);
    setMergedRecord(null);
    setMappedData(null);
    setLoanDocuments(null);
    setTriggerResult(null);
    setClassifications([]);
    setClassifyError(null);
    setClassificationOverrides({});
    setDocRequests([]);
    setDocUploads([]);
    setMatchResults([]);
    setDiscoveredRequestObj(null);
    setDebugInfo(null);

    try {
      // Step 1: look up loan by logNumber using the list endpoint filter
      const listResult = await api.getRecords('Loan', {
        page: 1,
        page_size: 1,
        filters: { logNumber: logNumber.trim() },
      });

      if (!listResult.records.length) {
        setLoadError(`No loan found with log number "${logNumber.trim()}". Use the Object Browser to find the correct log number.`);
        setLoading(false);
        return;
      }

      const loanId = String(listResult.records[0].id ?? listResult.records[0].uuid ?? '');
      if (!loanId) {
        setLoadError('Loan record found but has no usable ID.');
        setLoading(false);
        return;
      }

      // Step 2: fetch full loan record by ID
      const loanRec = await api.getRecord('Loan', loanId);
      setRawLoanRecord(loanRec);

      // Step 3: fetch primary contact (borrower email / name) — best-effort
      let contactRec: Record<string, unknown> = {};
      const primaryContactId = loanRec.primaryContactId;
      let contactEndpoint: string | undefined;
      if (primaryContactId) {
        try {
          contactRec = await api.getRecord('Contact', String(primaryContactId));
          setRawContactRecord(contactRec);
          contactEndpoint = `/api/v4/objects/contact/${primaryContactId}`;
        } catch { /* ignore — contact info will just be missing */ }
      }

      // Step 3.5: fetch assigned BDO from LoanPartner (roleType = LoanOfficer)
      let loanPartnerName: string | undefined;
      let partnerEndpoint: string | undefined;
      try {
        const partnerResult = await api.getRecords('LoanPartner', {
          page: 1,
          page_size: 10,
          filters: { loanId: loanId },
        });
        const officer = partnerResult.records.find(
          (r) => String(r.roleType ?? '').toLowerCase() === 'loanofficer'
        ) ?? partnerResult.records[0];
        if (officer?.name) loanPartnerName = String(officer.name);
        partnerEndpoint = `/api/v4/objects/loanpartner/list?loanId=${loanId}`;
      } catch { /* ignore — BDO will show as blank */ }

      const merged = { ...contactRec, ...loanRec, ...(loanPartnerName ? { loanPartnerName } : {}) };
      setMergedRecord(merged);
      setMappedData(mapApplicationRecord(merged, fieldOverrides));

      // Step 4: fetch uploaded documents via LoanDocument list (filtered by loanId)
      let docsEndpoint: string | undefined;
      let rawUploadRecords: Record<string, unknown>[] = [];
      let uploadedDocsList: UploadedDocument[] = [];
      try {
        const uploadResult = await fetchUploadedDocuments(api, loanId);
        uploadedDocsList = uploadResult.uploads;
        rawUploadRecords = uploadResult.rawRecords;
        setDocUploads(uploadedDocsList);
        // Also keep the old loanDocuments state for the inspector tab
        const docs = uploadResult.uploads.map((u) => ({
          id: Number(u.loanDocumentId) || 0,
          documentType: u.documentType ?? '',
          fileName: u.fileName,
          addedDate: u.uploadDate ?? '',
        }));
        setLoanDocuments(docs);
        docsEndpoint = `/api/v4/objects/loandocument/list?loanId=${loanId}`;
        if (docs.length > 0) {
          void classifyDocuments(loanId, docs);
        }
      } catch {
        setLoanDocuments([]);
        setDocUploads([]);
      }

      // Step 5: Discover and fetch document requests
      let requestEndpoint: string | undefined;
      let requestObjectName = '— (not found)';
      let requestObjectFields: string[] = [];
      let rawRequestRecords: Record<string, unknown>[] = [];
      let requestsList: DocumentRequest[] = [];
      const apiLimitations: string[] = [];
      let docSource: DocumentSource = 'request_object';

      try {
        const discovered = await discoverDocumentRequestObject(api);
        if (discovered) {
          setDiscoveredRequestObj(discovered);
          requestObjectName = discovered.objectName;
          requestObjectFields = discovered.fields;
          requestEndpoint = `${discovered.endpoint}${loanId}`;
          apiLimitations.push(...discovered.limitations);

          const fetchResult = await fetchDocumentRequests(
            api, discovered.objectName, discovered.filterField, loanId
          );
          requestsList = fetchResult.requests;
          rawRequestRecords = fetchResult.rawRecords;
          setDocRequests(requestsList);
        } else {
          // Fallback strategy: Try querying DocumentType with loanId filter first.
          // Ventures requires loanId for most loan-scoped objects (LoanDocument, Contact,
          // etc.), and when browsing a loan in Ventures directly, the documents URL
          // includes the loanId. If DocumentType supports loanId filtering, we get only
          // the document types linked to this specific loan.
          //
          // If the loanId filter is ignored (returns full catalog) or errors, fall back
          // to using the full DocumentType catalog as the master checklist, cross-referenced
          // against uploaded LoanDocument records.
          const docTypeCatalog = await discoverDocumentTypeCatalog(api);
          if (docTypeCatalog) {
            setDiscoveredDocTypeCatalog(docTypeCatalog);
            requestObjectName = docTypeCatalog.objectName;
            requestObjectFields = docTypeCatalog.fields;
            requestEndpoint = docTypeCatalog.endpoint;

            // Step 1: Try loan-scoped DocumentType query with loanId filter
            let loanDocTypes: { records: Record<string, unknown>[]; filterUsed: string; totalCatalogCount: number } | null = null;
            try {
              loanDocTypes = await fetchLoanDocumentTypes(api, docTypeCatalog.objectName, loanId);
            } catch (e: unknown) {
              apiLimitations.push(`DocumentType loan-scoped query error: ${e instanceof Error ? e.message : String(e)}`);
            }

            if (loanDocTypes) {
              // loanId filter worked — use the loan-scoped document types
              docSource = 'loan_document_types';
              rawRequestRecords = loanDocTypes.records;
              apiLimitations.push(
                `DocumentType queried with ${loanDocTypes.filterUsed} filter — returned ${loanDocTypes.records.length} document types linked to this loan (catalog total: ${loanDocTypes.totalCatalogCount}).`,
              );
              if (loanDocTypes.records.length === 0) {
                apiLimitations.push('No document types are linked to this loan via loanId filter — the loan may not have any required documents configured yet.');
              }
              // Build typeMap from the loan-scoped records for name enrichment
              const typeMap = new Map<string, string>();
              for (const r of loanDocTypes.records) {
                const id = String(r.id ?? r.uuid ?? '');
                const name = String(r.name ?? r.documentName ?? r.description ?? '').trim();
                if (id && name) typeMap.set(id, name);
              }
              requestsList = buildRequestsFromDocTypes(loanDocTypes.records, uploadedDocsList, typeMap);
              setDocRequests(requestsList);
            } else {
              // loanId filter didn't work — fall back to full catalog with cross-referencing
              let typeMap = new Map<string, string>();
              let catalogRecords: Record<string, unknown>[] = [];
              try {
                const catResult = await fetchDocumentTypeCatalog(api, docTypeCatalog.objectName);
                catalogRecords = catResult.rawRecords;
                rawRequestRecords = catResult.rawRecords;
                typeMap = catResult.typeMap;
              } catch (ce: unknown) {
                apiLimitations.push(`DocumentType catalog fetch error: ${ce instanceof Error ? ce.message : String(ce)}`);
              }

              docSource = 'document_type_catalog';
              apiLimitations.push(
                'DocumentType does not support loanId filtering (filter was ignored or rejected). Using the full DocumentType catalog as the required document checklist.',
                'Document statuses are determined by cross-referencing each catalog entry against this loan\u2019s uploaded LoanDocument records — entries with no matching upload are shown as Incomplete.',
              );
              requestsList = buildRequestsFromDocTypes(catalogRecords, uploadedDocsList, typeMap);
              setDocRequests(requestsList);
            }
          } else {
            apiLimitations.push('No dedicated document-request object found in Ventures API — document requests may not be tracked via a separate API object');
            apiLimitations.push('No DocumentType catalog object found either — unable to determine required documents');
            setDiscoveredRequestObj(null);
            setDiscoveredDocTypeCatalog(null);
          }
          setDiscoveredRequestObj(null);
        }
      } catch (e: unknown) {
        apiLimitations.push(`Document request fetch error: ${e instanceof Error ? e.message : String(e)}`);
      }
      setDocumentSource(docSource);

      // Step 6: Match uploaded docs to requests
      if (requestsList.length > 0) {
        const matches = matchDocuments(requestsList, uploadedDocsList);
        setMatchResults(matches);
      } else {
        setMatchResults([]);
      }

      // Step 7: Build debug info
      const missingFields = findMissingFields(
        requestObjectFields,
        EXPECTED_REQUEST_FIELDS
      );
      const missingUploadFields = findMissingFields(
        uploadedDocsList.length > 0 ? Object.keys(uploadedDocsList[0].rawRecord) : [],
        EXPECTED_UPLOAD_FIELDS
      );

      setDebugInfo({
        requestObjectName,
        requestObjectEndpoint: requestEndpoint ?? '—',
        requestObjectFields,
        documentSource: docSource,
        uploadedObjectName: 'LoanDocument',
        uploadedObjectEndpoint: docsEndpoint ?? '—',
        rawRequestResponse: rawRequestRecords,
        rawUploadResponse: rawUploadRecords,
        missingFields: [...missingFields, ...missingUploadFields],
        apiLimitations,
        matchDetails: matchDocuments(requestsList, uploadedDocsList).map((m) => ({
          requestName: m.request.documentName,
          matchMethod: m.matchMethod,
          detail: m.matchMethod === 'none'
            ? 'No matching upload found'
            : `${matchMethodLabel(m.matchMethod)} → ${m.uploadedDocs.map((u) => u.fileName).join(', ')}`,
        })),
      });

      setLoadMeta({
        ts: new Date().toISOString(),
        loanEndpoint: `/api/v4/objects/loan/${loanId}`,
        contactEndpoint,
        partnerEndpoint,
        docsEndpoint,
      });
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Effective values — unified interface for both modes
  const effectiveStatus       = hasLiveData ? (mappedData!.applicationStatus ?? '') : simStatus;
  const effectiveLastActivity = hasLiveData ? (mappedData!.lastActivityDate ?? lastActivity) : lastActivity;
  const docsFromApi           = hasLiveData && loanDocuments !== null;

  // Document request matching results (from real API or simulated)
  const effectiveMatchResults = hasLiveData ? matchResults : matchResults;
  const summaryStats: DocSummaryStats = useMemo(
    () => computeSummaryStats(effectiveMatchResults),
    [effectiveMatchResults]
  );

  // Documents that are truly incomplete (missing) — not pending review
  const incompleteDocs = useMemo(
    () => effectiveMatchResults.filter((m) => m.workflowState === 'incomplete'),
    [effectiveMatchResults]
  );
  const pendingReviewDocs = useMemo(
    () => effectiveMatchResults.filter((m) => m.workflowState === 'pending_review'),
    [effectiveMatchResults]
  );

  const liveVal = (key: keyof MappedApplicationData): string => {
    const v = mappedData?.[key];
    if (v === undefined || v === null) return '—';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };

  const daysSinceLastActivity = useMemo(() => {
    const d = new Date(effectiveLastActivity);
    if (isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86_400_000);
  }, [effectiveLastActivity]);

  // AI-assisted classification: map document ID → effective category (rule, LLM, or override)
  const classificationMap = useMemo(() => {
    const map = new Map<string, { category: string | null; source: string; confidence: number; reason: string; overridden: boolean }>();
    for (const c of classifications) {
      const override = classificationOverrides[c.documentId];
      const overridden = override !== undefined;
      map.set(c.documentId, {
        category: overridden ? override : c.matchedCategory,
        source: overridden ? 'override' : c.source,
        confidence: overridden ? 1.0 : c.confidence,
        reason: overridden ? 'Manually overridden' : c.reason,
        overridden,
      });
    }
    return map;
  }, [classifications, classificationOverrides]);

  const classificationStats = useMemo(() => ({
    ruleBased: classifications.filter((c) => c.source === 'rule').length,
    llmBased: classifications.filter((c) => c.source === 'llm').length,
    unverified: classifications.filter((c) => c.source === 'unverified').length,
  }), [classifications]);

  // Missing documents = those with workflowState 'incomplete'
  const missingDocuments  = incompleteDocs.map((m) => m.request.documentName);
  const escalationNeeded  = daysSinceLastActivity > threshold * 2;

  // For trigger logic: borrower reminder eligible docs
  const borrowerReminderEligible = useMemo(
    () => incompleteDocs.filter((m) => m.daysOutstanding >= threshold),
    [incompleteDocs, threshold]
  );
  // Internal review follow-up eligible docs
  const internalReviewEligible = useMemo(() => {
    return pendingReviewDocs.filter((m) => {
      if (!m.lastUploadDate) return false;
      const d = new Date(m.lastUploadDate);
      if (isNaN(d.getTime())) return false;
      const daysSinceUpload = Math.floor((Date.now() - d.getTime()) / 86_400_000);
      return daysSinceUpload >= reviewSla;
    });
  }, [pendingReviewDocs, reviewSla]);

  const buildTriggerContext = (): TriggerContext => ({
    borrower_name: hasLiveData ? (mappedData?.borrowerName ?? '') : simBorrowerName,
    borrower_email: hasLiveData ? (mappedData?.borrowerEmail ?? '') : simBorrowerEmail,
    log_number: hasLiveData ? (mappedData?.applicationId ?? '') : 'SIM-001',
    loan_id: hasLiveData ? String(rawLoanRecord?.id ?? '') : 'sim',
    assigned_bdo: hasLiveData ? (mappedData?.assignedBDO ?? '') : simBdo,
    missing_documents: missingDocuments.join(', ') || 'None',
    uploaded_documents: docUploads.map((d) => d.documentType ?? d.fileName).filter(Boolean).join(', ') || 'None',
    document_categories: docUploads.map((d) => d.documentCategory ?? d.documentType).filter(Boolean).join(', ') || 'None',
    days_inactive: daysSinceLastActivity,
    threshold,
    current_status: effectiveStatus,
  });

  const testTrigger = async () => {
    setEmailResult(null);

    // If a trigger from the Trigger Builder is selected, use it
    if (selectedTrigger) {
      const ctx = {
        status: effectiveStatus,
        daysSinceActivity: daysSinceLastActivity,
        threshold,
        missingDocsCount: missingDocuments.length,
        hasUploadedDocs: docUploads.length > 0,
        documentCategories: Array.from(classificationMap.values()).map((v) => v.category).filter(Boolean) as string[],
      };
      const result = evaluateTrigger(selectedTrigger, ctx);

      let emailSent = false;
      let emailError: string | undefined;
      let emailRecipient: string | undefined;

      if (result.fires && selectedTrigger.email_subject && selectedTrigger.email_body) {
        const triggerCtx = buildTriggerContext();
        const recipient = resolveRecipient(selectedTrigger, triggerCtx);
        if (recipient) {
          setEmailSending(true);
          const subject = renderTemplate(selectedTrigger.email_subject, triggerCtx);
          const body = renderTemplate(selectedTrigger.email_body, triggerCtx);
          const sendResult = await sendEmail({
            to: recipient.email,
            subject,
            body,
            triggerId: selectedTrigger.id,
            triggerName: selectedTrigger.name,
            recipientType: selectedTrigger.recipient_type,
            notificationType: selectedTrigger.notification_type,
            context: { ...triggerCtx, workflow: 'loan_intake' },
          });
          setEmailSending(false);
          emailSent = sendResult.success;
          emailError = sendResult.success ? undefined : sendResult.error;
          emailRecipient = recipient.email;
          setEmailResult({
            success: sendResult.success,
            message: sendResult.success
              ? `Email sent to ${recipient.label}`
              : `Email failed: ${sendResult.error}`,
            recipient: recipient.email,
          });
        } else {
          emailError = `No recipient email resolved for type "${selectedTrigger.recipient_type}" — check that borrower email is available`;
          setEmailResult({ success: false, message: emailError });
        }
      }

      setTriggerResult({
        fires: result.fires,
        borrowerReminder: result.fires && selectedTrigger.recipient_type === 'borrower',
        internalReminder: result.fires && (selectedTrigger.recipient_type === 'internal' || selectedTrigger.recipient_type === 'bdo'),
        reasons: result.reasons,
        triggerName: selectedTrigger.name,
        emailSent,
        emailError,
        emailRecipient,
      });
      return;
    }

    // Fallback: built-in trigger logic using real document request statuses
    const statusMatch       = effectiveStatus === 'Documents Pending';
    const borrowerEligible  = borrowerReminderEligible.length > 0;
    const internalEligible  = internalReviewEligible.length > 0;
    const fires             = borrowerEligible || internalEligible;

    const perDocReasons = effectiveMatchResults.map((m) => ({
      name: m.request.documentName,
      state: m.workflowState,
      action: m.recommendedAction,
    }));

    const reasons: string[] = [];
    reasons.push(
      statusMatch
        ? '✓ Status = Documents Pending'
        : `✗ Status = "${effectiveStatus}" (expected "Documents Pending")`
    );
    if (borrowerEligible) {
      reasons.push(`✓ ${borrowerReminderEligible.length} document(s) Incomplete + ${threshold}d threshold met:`);
      borrowerReminderEligible.forEach((m) => {
        reasons.push(`  → ${m.request.documentName} (${m.daysOutstanding}d outstanding)`);
      });
    } else {
      reasons.push(`✗ No documents meet borrower reminder criteria (Incomplete + ${threshold}d threshold)`);
    }
    if (internalEligible) {
      reasons.push(`✓ ${internalReviewEligible.length} document(s) Pending Review + ${reviewSla}d SLA exceeded:`);
      internalReviewEligible.forEach((m) => {
        reasons.push(`  → ${m.request.documentName} (uploaded ${m.lastUploadDate})`);
      });
    }
    if (pendingReviewDocs.length > 0 && !internalEligible) {
      reasons.push(`ℹ ${pendingReviewDocs.length} document(s) in Pending Review — not classified as missing`);
    }

    setTriggerResult({
      fires,
      borrowerReminder: borrowerEligible,
      internalReminder: internalEligible,
      reasons,
      perDocReasons,
    });
  };

  const readinessItems = useMemo(() => {
    if (!isLive) return [];
    const md  = mappedData;
    const has = (v: string | undefined) => !!v;
    return [
      { label: 'Connection Active',             status: isConnected      ? 'green'  : 'red',    detail: isConnected ? 'API authenticated' : 'Not connected' },
      { label: 'Loan Record Loadable',          status: rawLoanRecord    ? 'green'  : loadError ? 'red' : 'yellow', detail: rawLoanRecord ? 'Loan record retrieved' : loadError ?? 'No record loaded yet' },
      { label: 'Contact Record Loadable',       status: rawContactRecord ? 'green'  : rawLoanRecord ? 'yellow' : 'yellow', detail: rawContactRecord ? 'Primary contact retrieved' : rawLoanRecord ? 'No primaryContactId on loan' : 'Needs loan record first' },
      { label: 'Log Number Mapped',             status: has(md?.applicationId)     ? 'green' : 'red',    detail: md?.applicationId ?? 'Not found in record' },
      { label: 'Loan Status Mapped',            status: has(md?.applicationStatus) ? 'green' : 'red',    detail: md?.applicationStatus ?? 'Not found in record' },
      { label: 'Borrower Name Mapped',          status: has(md?.borrowerName)      ? 'green' : 'red',    detail: md?.borrowerName ?? 'Not found in record' },
      { label: 'Borrower Email Mapped',         status: has(md?.borrowerEmail)     ? 'green' : 'yellow', detail: md?.borrowerEmail ?? 'Check Contact record — adjust field mapping if needed' },
      { label: 'Assigned BDO Mapped',           status: has(md?.assignedBDO)       ? 'green' : rawLoanRecord ? 'yellow' : 'yellow', detail: md?.assignedBDO ?? 'From LoanPartner (roleType=LoanOfficer) — fetched automatically' },
      { label: 'Submission Date Mapped',        status: has(md?.submissionDate)    ? 'green' : 'yellow', detail: md?.submissionDate ?? 'Not found — adjust field mapping' },
      { label: 'Last Activity Date Mapped',     status: has(md?.lastActivityDate)  ? 'green' : 'red',    detail: md?.lastActivityDate ?? 'Required for trigger logic' },
      { label: 'Documents Loadable',            status: loanDocuments !== null ? (loanDocuments.length > 0 ? 'green' : 'yellow') : rawLoanRecord ? 'yellow' : 'yellow', detail: loanDocuments !== null ? `${loanDocuments.length} document(s) on file via LoanDocument API` : 'Needs loan record first' },
      { label: 'Document Classification',       status: classifications.length > 0 ? (classificationStats.unverified === 0 ? 'green' : 'yellow') : (loanDocuments && loanDocuments.length > 0 ? 'yellow' : 'gray'), detail: classifications.length > 0 ? `${classificationStats.ruleBased} rule, ${classificationStats.llmBased} AI, ${classificationStats.unverified} unverified` : 'No classifications yet' },
      { label: 'Trigger Conditions Resolvable', status: has(md?.applicationStatus) && has(md?.lastActivityDate) ? 'green' : 'red', detail: 'Requires loanStatus + updatedDate' },
    ] as Array<{ label: string; status: 'green' | 'yellow' | 'red'; detail: string }>;
  }, [isLive, mappedData, rawLoanRecord, rawContactRecord, loanDocuments, classifications, classificationStats, loadError, isConnected]);

  const readinessScore    = readinessItems.length > 0
    ? Math.round((readinessItems.filter((i) => i.status === 'green').length / readinessItems.length) * 100)
    : 0;
  const readinessBarClass  = readinessScore >= 80 ? 'bg-emerald-500' : readinessScore >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const readinessTextClass = readinessScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : readinessScore >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const readinessSummary   = readinessScore >= 80 ? 'Ready for production' : readinessScore >= 50 ? 'Partially supported' : 'Critical gaps present';

  const mappedCount = mergedRecord
    ? FIELD_CONFIGS.filter((fc) => {
        const override   = fieldOverrides[fc.key]?.trim();
        const candidates = override ? [override, ...fc.candidates] : fc.candidates;
        return candidates.some((c) => c in mergedRecord && mergedRecord[c] != null && mergedRecord[c] !== '');
      }).length
    : 0;

  return (
    <div className="space-y-5">

      {/* ── Mode Toggle ── */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
          {(['simulated', 'live'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {m === 'simulated' ? <WifiOff size={13} /> : <Wifi size={13} />}
              {m === 'simulated' ? 'Simulated Mode' : 'Live Mode'}
            </button>
          ))}
        </div>
        {isLive && (
          <Badge variant={isConnected ? 'green' : 'red'} dot>
            {isConnected ? 'API Connected' : 'Disconnected'}
          </Badge>
        )}
      </div>

      {/* ── Connection / Load Panel ── */}
      {isLive ? (
        <Card padding="sm">
          {!isConnected ? (
            <Alert variant="warning">
              Not connected to the Ventures API. Go to the <strong>Connection</strong> page to authenticate before loading live records.
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  Log Number
                </label>
                <input
                  className="input text-sm flex-1 max-w-xs font-mono"
                  placeholder="e.g. SAMPLE000001"
                  value={logNumber}
                  onChange={(e) => setLogNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && load()}
                />
                <button onClick={load} disabled={!logNumber.trim() || loading} className="btn-primary text-xs py-1.5">
                  {loading
                    ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
                    : <><Search size={13} /> Load Record</>}
                </button>
          {isLive && mergedRecord && (
            <Badge variant="green" dot>Loan + Contact + Partner + Docs loaded</Badge>
          )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                <Info size={11} className="shrink-0" />
                Searches by log number → fetches Loan → fetches linked Contact → fetches LoanPartner (BDO) → fetches LoanDocuments.
                Use the Object Browser to find a log number.
              </div>
              {loadError && <Alert variant="error">{loadError}</Alert>}
              {loadMeta && (
                <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 space-y-0.5">
                  <div>GET {loadMeta.loanEndpoint} · {new Date(loadMeta.ts).toLocaleTimeString()}</div>
                  {loadMeta.contactEndpoint && <div>GET {loadMeta.contactEndpoint} (primary contact)</div>}
                  {loadMeta.partnerEndpoint && <div>GET {loadMeta.partnerEndpoint} (assigned BDO)</div>}
                  {loadMeta.docsEndpoint && <div>GET {loadMeta.docsEndpoint} ({loanDocuments?.length ?? 0} documents)</div>}
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Alert variant="info">
          Running in Simulated Mode — edit the fields below to test trigger logic without a live API connection.
        </Alert>
      )}

      {/* ── Field Mapping Panel ── */}
      <Card padding="none">
        <button
          onClick={() => setMappingOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-neutral-500" />
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Field Mapping</span>
            {isLive && mergedRecord && (
              <Badge variant={mappedCount >= FIELD_CONFIGS.length * 0.8 ? 'green' : 'yellow'}>
                {mappedCount}/{FIELD_CONFIGS.length} fields resolved
              </Badge>
            )}
          </div>
          {mappingOpen ? <ChevronDown size={14} className="text-neutral-400" /> : <ChevronRight size={14} className="text-neutral-400" />}
        </button>

        {mappingOpen && (
          <div className="border-t border-neutral-100 dark:border-neutral-800">
            <div className="px-5 py-2.5 bg-neutral-50/50 dark:bg-neutral-800/30 text-xs text-neutral-500 dark:text-neutral-400">
              {isLive
                ? 'Edit the Source Field column to override auto-detection. Loan fields take priority; Contact fields are merged in for borrower details.'
                : 'Default field mappings for Ventures Loan + Contact objects. Load a live record to see availability status.'}
            </div>
            <div className="grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/30">
              <div className="col-span-3">Validator Field</div>
              <div className="col-span-2">Source Object</div>
              <div className="col-span-4">Source Field</div>
              <div className="col-span-3">Status</div>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {FIELD_CONFIGS.map((fc) => {
                const override   = fieldOverrides[fc.key]?.trim();
                const candidates = override ? [override, ...fc.candidates] : fc.candidates;
                let fieldStatus: 'available' | 'missing' | 'unchecked' = 'unchecked';
                let resolvedKey = '';
                if (mergedRecord) {
                  const found = candidates.find(
                    (c) => c in mergedRecord && mergedRecord[c] != null && mergedRecord[c] !== ''
                  );
                  if (found) { fieldStatus = 'available'; resolvedKey = found; }
                  else        { fieldStatus = 'missing'; }
                }
                return (
                  <div key={fc.key} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-start hover:bg-neutral-50 dark:hover:bg-neutral-800/20">
                    <div className="col-span-3">
                      <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{fc.label}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">{fc.key}</div>
                    </div>
                    <div className="col-span-2 text-xs text-neutral-500 dark:text-neutral-400 pt-0.5">{fc.venturesObject}</div>
                    <div className="col-span-4">
                      <input
                        className="input text-xs py-1 w-full font-mono"
                        placeholder={fc.candidates[0]}
                        value={fieldOverrides[fc.key] ?? ''}
                        onChange={(e) => handleOverrideChange(fc.key, e.target.value)}
                      />
                      {fieldStatus === 'available' && resolvedKey && !fieldOverrides[fc.key] && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">auto: {resolvedKey}</div>
                      )}
                      {fc.note && (
                        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 italic">{fc.note}</div>
                      )}
                    </div>
                    <div className="col-span-3 pt-0.5">
                      {fieldStatus === 'available' && <Badge variant="green" dot>Available</Badge>}
                      {fieldStatus === 'missing'   && <Badge variant="red"   dot>Missing</Badge>}
                      {fieldStatus === 'unchecked' && <Badge variant="gray">Not checked</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* ── Loan Details + Document Checklist ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <Badge variant={statusBadgeVariant(effectiveStatus)} dot>
              {effectiveStatus || 'Unknown'}
            </Badge>
          </CardHeader>
          <div className="space-y-3">
            {isLive ? (
              (([
                { icon: Tag,      label: 'Log Number',      key: 'applicationId'    },
                { icon: User,     label: 'Borrower Name',   key: 'borrowerName'     },
                { icon: Mail,     label: 'Borrower Email',  key: 'borrowerEmail'    },
                { icon: User,     label: 'Assigned BDO',    key: 'assignedBDO'      },
                { icon: Calendar, label: 'Submission Date', key: 'submissionDate'   },
                { icon: Clock,    label: 'Last Activity',   key: 'lastActivityDate' },
                { icon: Activity, label: 'Current Stage',   key: 'currentStage'     },
              ]) as Array<{ icon: React.ElementType; label: string; key: keyof MappedApplicationData }>).map(
                ({ icon: Icon, label, key }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon size={13} className="text-neutral-400 shrink-0" />
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">{label}</span>
                    <span className={`text-xs font-medium ${mappedData?.[key] ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 italic'}`}>
                      {liveVal(key)}
                    </span>
                  </div>
                )
              )
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <User size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Borrower Name</span>
                  <input className="input text-xs flex-1" value={simBorrowerName} onChange={(e) => setSimBorrowerName(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Borrower Email</span>
                  <input className="input text-xs flex-1" value={simBorrowerEmail} onChange={(e) => setSimBorrowerEmail(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <User size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Assigned BDO</span>
                  <input className="input text-xs flex-1" value={simBdo} onChange={(e) => setSimBdo(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Submission Date</span>
                  <input type="date" className="input text-xs flex-1" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Last Activity</span>
                  <input type="date" className="input text-xs flex-1" value={lastActivity} onChange={(e) => setLastActivity(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 w-28 shrink-0">Status</span>
                  <select className="input text-xs flex-1" value={simStatus} onChange={(e) => setSimStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Days since last activity</div>
              <div className={`text-2xl font-bold ${daysSinceLastActivity > threshold ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {daysSinceLastActivity}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TableIcon size={15} className="text-neutral-500" />
              <CardTitle>
                {documentSource === 'loan_document_types'
                  ? 'Required Documents for This Loan'
                  : documentSource === 'document_type_catalog'
                    ? 'Uploaded Documents for This Loan'
                    : 'Requested Documents from Ventures'}
              </CardTitle>
            </div>
            <Badge variant={summaryStats.incomplete > 0 ? 'red' : summaryStats.pendingReview > 0 ? 'yellow' : 'green'} dot>
              {summaryStats.total} requested
            </Badge>
          </CardHeader>

          {documentSource === 'loan_document_types' && effectiveMatchResults.length > 0 && (
            <Alert variant="info" className="mb-3">
              No per-loan document-request object was found, so DocumentType was queried with a loan-scoped filter to get only the document types linked to this loan. Document statuses are determined by cross-referencing against uploaded LoanDocument records — document types with no matching upload are shown as Incomplete.
            </Alert>
          )}
          {documentSource === 'document_type_catalog' && effectiveMatchResults.length > 0 && (
            <Alert variant="info" className="mb-3">
              No per-loan document-request object was found, and DocumentType does not support loan-scoped filtering. This list shows the actual documents uploaded for this loan, with display names enriched from the DocumentType catalog. Review statuses come directly from the uploaded LoanDocument records.
            </Alert>
          )}

          {isLive && !mergedRecord && (
            <Alert variant="info" className="mb-3">Load a loan record to fetch the actual document requests from Ventures.</Alert>
          )}

          {/* Summary metrics */}
          {effectiveMatchResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
              {([
                { label: 'Total Requested',   value: summaryStats.total,         variant: 'blue'   as const },
                { label: 'Missing / Incomplete', value: summaryStats.incomplete,     variant: 'red'    as const },
                { label: 'Pending Review',    value: summaryStats.pendingReview,  variant: 'yellow' as const },
                { label: 'Complete',          value: summaryStats.accepted,       variant: 'green'  as const },
                { label: 'Rejected',          value: summaryStats.rejected,       variant: 'orange' as const },
                { label: 'Unknown',           value: summaryStats.unknown,        variant: 'gray'   as const },
              ]).map(({ label, value, variant }) => (
                <div key={label} className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50 text-center">
                  <div className={`text-lg font-bold ${
                    variant === 'red' ? 'text-red-600 dark:text-red-400' :
                    variant === 'yellow' ? 'text-amber-600 dark:text-amber-400' :
                    variant === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
                    variant === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                    variant === 'blue' ? 'text-primary-600 dark:text-primary-400' :
                    'text-neutral-500'
                  }`}>{value}</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Document request table */}
          {effectiveMatchResults.length === 0 ? (
            <Alert variant="warning">
              {isLive
                ? (discoveredRequestObj
                  ? `No document requests found for this loan via ${discoveredRequestObj.objectName}.`
                  : discoveredDocTypeCatalog
                    ? `No DocumentType records found in the ${discoveredDocTypeCatalog.objectName} catalog.`
                    : 'No document request object or DocumentType catalog found in the Ventures API. Document requests may not be tracked via a separate API object for this instance.'
                )
                : 'No simulated document requests available.'
              }
            </Alert>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400">Requested Document</th>
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">Entity</th>
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400">Ventures Status</th>
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400">Upload</th>
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400 hidden md:table-cell">Days Out</th>
                    <th className="py-2 pr-3 font-semibold text-neutral-600 dark:text-neutral-400">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveMatchResults.map((m) => (
                    <tr key={m.request.requestId} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-neutral-800 dark:text-neutral-200">{m.request.documentName}</div>
                        {m.request.comments && (
                          <div className="text-[10px] text-neutral-400 truncate max-w-[200px]">{m.request.comments}</div>
                        )}
                        {m.matchMethod === 'fuzzy_name' && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="orange">AI/Fuzzy</Badge>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                        {m.request.entityName ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">{m.request.requestStatus}</span>
                          <Badge variant={workflowStateBadgeVariant(m.workflowState)} dot>
                            {workflowStateLabel(m.workflowState)}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {m.uploadedDocs.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-neutral-700 dark:text-neutral-300 font-medium">
                              {m.uploadedDocs.length} file{m.uploadedDocs.length !== 1 ? 's' : ''}
                            </span>
                            {m.lastUploadDate && (
                              <span className="text-[10px] text-neutral-400">{new Date(m.lastUploadDate).toLocaleDateString()}</span>
                            )}
                            <span className="text-[10px] text-neutral-400 truncate max-w-[120px]">{m.uploadedDocs[0].fileName}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400 italic text-[11px]">None</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-600 dark:text-neutral-400 hidden md:table-cell">
                        {m.daysOutstanding > 0 ? `${m.daysOutstanding}d` : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-[11px] font-medium ${
                          m.recommendedAction === 'Borrower Reminder' ? 'text-red-600 dark:text-red-400' :
                          m.recommendedAction === 'Internal Review' ? 'text-amber-600 dark:text-amber-400' :
                          m.recommendedAction === 'Request Correction' ? 'text-orange-600 dark:text-orange-400' :
                          m.recommendedAction.startsWith('None') ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-neutral-500'
                        }`}>
                          {m.recommendedAction}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Uploaded documents with AI classification (live mode, kept for reference) */}
          {docsFromApi && loanDocuments && loanDocuments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Uploaded Files ({loanDocuments.length}) — from LoanDocument API
                </span>
                {classifying ? (
                  <Badge variant="blue" dot><RefreshCw size={10} className="animate-spin" /> Classifying</Badge>
                ) : classifyError ? (
                  <Badge variant="red" dot>Error</Badge>
                ) : classifications.length > 0 && (
                  <div className="flex items-center gap-1">
                    {classificationStats.ruleBased > 0 && <Badge variant="green">Rule: {classificationStats.ruleBased}</Badge>}
                    {classificationStats.llmBased > 0 && <Badge variant="blue"><Sparkles size={9} /> AI: {classificationStats.llmBased}</Badge>}
                    {classificationStats.unverified > 0 && <Badge variant="yellow">Unverified: {classificationStats.unverified}</Badge>}
                  </div>
                )}
              </div>
              {classifyError && (
                <Alert variant="error" className="mb-2 text-[11px]">{classifyError}</Alert>
              )}
              <div className="space-y-1.5">
                {loanDocuments.map((doc) => {
                  const cls = classificationMap.get(String(doc.id));
                  const hasCategory = !!cls?.category;
                  return (
                    <div
                      key={doc.id}
                      className={`p-2 rounded-lg border ${
                        hasCategory
                          ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30'
                          : 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hasCategory ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <FileText size={12} className="text-neutral-400 shrink-0" />}
                        <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate flex-1">{doc.documentType || '—'}</span>
                        <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[160px]">{doc.fileName}</span>
                      </div>
                      {cls && (
                        <div className="flex items-center gap-1.5 mt-1 pl-5 flex-wrap">
                          <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">{cls.category || 'Unmatched'}</span>
                          {cls.source === 'rule' && <Badge variant="green">Rule</Badge>}
                          {cls.source === 'llm' && <Badge variant="blue"><Sparkles size={9} /> AI {Math.round(cls.confidence * 100)}%</Badge>}
                          {cls.source === 'override' && <Badge variant="orange">Override</Badge>}
                          {cls.source === 'unverified' && <Badge variant="yellow">Unverified</Badge>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Calculated Fields ── */}
      <Card>
        <CardHeader>
          <CardTitle>Calculated Fields</CardTitle>
          <Badge variant={hasLiveData ? 'green' : 'gray'} dot>
            {hasLiveData ? 'Live Data' : isLive ? 'No Record Loaded' : 'Simulated'}
          </Badge>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(([
            { icon: Clock,         label: 'Days Since Last Activity', value: String(daysSinceLastActivity), flag: daysSinceLastActivity > threshold,  detail: `Threshold: ${threshold} days` },
            { icon: FileText,      label: 'Missing / Incomplete',       value: String(summaryStats.incomplete),  flag: summaryStats.incomplete > 0,    detail: summaryStats.incomplete > 0 ? incompleteDocs.slice(0, 2).map((m) => m.request.documentName).join(', ') + (summaryStats.incomplete > 2 ? ` +${summaryStats.incomplete - 2}` : '') : 'All documents present or pending review' },
            { icon: Bell,          label: 'Borrower Reminder Eligible', value: String(borrowerReminderEligible.length), flag: borrowerReminderEligible.length > 0, detail: borrowerReminderEligible.length > 0 ? `${borrowerReminderEligible.length} doc(s) Incomplete + ${threshold}d threshold` : `No docs meet Incomplete + ${threshold}d criteria` },
            { icon: AlertTriangle, label: 'Internal Review Eligible',   value: String(internalReviewEligible.length),  flag: internalReviewEligible.length > 0,  detail: internalReviewEligible.length > 0 ? `${internalReviewEligible.length} doc(s) Pending Review + ${reviewSla}d SLA` : `No docs exceed ${reviewSla}d review SLA` },
            { icon: TrendingUp,    label: 'Escalation Needed',          value: escalationNeeded ? 'YES' : 'No',  flag: escalationNeeded,  detail: `Days > ${threshold * 2} (2× inactivity threshold)` },
          ]) as Array<{ icon: React.ElementType; label: string; value: string; flag: boolean; detail: string }>).map(
            ({ icon: Icon, label, value, flag, detail }) => (
              <div
                key={label}
                className={`p-3 rounded-xl border ${flag ? 'border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-900/10' : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Icon size={13} className={flag ? 'text-red-500' : 'text-neutral-400'} />
                  <span className={`text-lg font-bold ${flag ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{value}</span>
                </div>
                <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 leading-tight">{label}</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-tight">{detail}</div>
              </div>
            )
          )}
        </div>
      </Card>

      {/* ── Active Triggers from Trigger Builder ── */}
      {triggers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-primary-500" />
              <CardTitle>Enabled Triggers</CardTitle>
            </div>
            <Badge variant="green" dot>{triggers.length} active</Badge>
          </CardHeader>
          <div className="space-y-2">
            {triggers.map((t) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedTriggerId === t.id
                    ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
                onClick={() => { setSelectedTriggerId(t.id === selectedTriggerId ? '' : (t.id || '')); setEmailResult(null); }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Power size={12} className={selectedTriggerId === t.id ? 'text-primary-500' : 'text-emerald-500'} />
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">{t.name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {t.recipient_type === 'borrower' && <Badge variant="blue">Borrower</Badge>}
                    {t.recipient_type === 'internal' && <Badge variant="blue">Internal</Badge>}
                    {t.recipient_type === 'bdo' && <Badge variant="blue">BDO</Badge>}
                    {t.email_subject && <Badge variant="green" dot>Email</Badge>}
                  </div>
                </div>
                {selectedTriggerId === t.id && (
                  <div className="mt-2 pl-5 space-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {t.email_subject && <div className="font-mono">Subject: {t.email_subject}</div>}
                    {t.email_body && <div className="font-mono line-clamp-2">Body: {t.email_body.substring(0, 120)}{t.email_body.length > 120 ? '…' : ''}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Trigger Logic Tester ── */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Logic Tester</CardTitle>
          <Badge variant={hasLiveData ? 'green' : 'gray'} dot>
            {hasLiveData ? 'Live Data' : 'Simulated'}
          </Badge>
        </CardHeader>
        <div className="space-y-4">
          {selectedTrigger ? (
            <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800/30">
              <div className="text-xs font-semibold text-primary-700 dark:text-primary-400 mb-2">
                Evaluating: {selectedTrigger.name}
              </div>
              <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                <div><span className="text-amber-600 dark:text-amber-400">Event:</span> {selectedTrigger.trigger_event}</div>
                {selectedTrigger.condition_field && (
                  <div><span className="text-amber-600 dark:text-amber-400">IF</span> {selectedTrigger.condition_field} {selectedTrigger.condition_operator} <span className="text-emerald-600 dark:text-emerald-400">"{selectedTrigger.condition_value}"</span></div>
                )}
                {selectedTrigger.email_subject && (
                  <div><span className="text-amber-600 dark:text-amber-400">NOTIFY:</span> {selectedTrigger.recipient_type} via {selectedTrigger.notification_type}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Default Condition</div>
              <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                <div><span className="text-amber-600 dark:text-amber-400">IF</span> Loan.loanStatus == <span className="text-emerald-600 dark:text-emerald-400">"Documents Pending"</span></div>
                <div><span className="text-amber-600 dark:text-amber-400">AND</span> required_document_missing == <span className="text-emerald-600 dark:text-emerald-400">true</span></div>
                <div><span className="text-amber-600 dark:text-amber-400">AND</span> days_since_updatedDate {'>'} <span className="text-primary-600 dark:text-primary-400">threshold</span></div>
              </div>
              {triggers.length === 0 && (
                <div className="mt-2 text-[11px] text-neutral-400">
                  No enabled triggers for this workflow. Create and enable triggers in the Trigger Builder to send real emails.
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Inactivity Threshold (days)</label>
              <input type="number" min={1} max={90} className="input w-20 text-sm text-center" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Review SLA (days)</label>
              <input type="number" min={1} max={30} className="input w-20 text-sm text-center" value={reviewSla} onChange={(e) => setReviewSla(Number(e.target.value))} />
            </div>
          </div>
          <button onClick={testTrigger} disabled={emailSending} className="btn-primary">
            {emailSending
              ? <><RefreshCw size={14} className="animate-spin" /> Sending Email…</>
              : <><PlayCircle size={14} /> {selectedTrigger ? 'Test & Send' : 'Test Trigger'}</>}
          </button>
          {triggerResult && (
            <div className={`p-4 rounded-xl border-2 ${triggerResult.fires ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'}`}>
              <div className="flex items-center gap-2 mb-3">
                {triggerResult.fires ? <AlertTriangle size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
                <span className={`text-sm font-semibold ${triggerResult.fires ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                  {triggerResult.triggerName ? `${triggerResult.triggerName} — ` : ''}Trigger {triggerResult.fires ? 'FIRES' : 'does NOT fire'}
                </span>
              </div>
              <div className="space-y-1 mb-3">
                {triggerResult.reasons.map((r, i) => (
                  <div key={i} className="text-xs font-mono text-neutral-700 dark:text-neutral-300">{r}</div>
                ))}
              </div>
              {triggerResult.fires && (
                <div className="flex gap-2 flex-wrap pt-2 border-t border-amber-200 dark:border-amber-800">
                  {triggerResult.borrowerReminder && <Badge variant="orange" dot>Borrower Reminder Required</Badge>}
                  {triggerResult.internalReminder  && <Badge variant="yellow" dot>Internal Reminder Required</Badge>}
                  {triggerResult.emailSent && <Badge variant="green" dot>Email Sent to {triggerResult.emailRecipient}</Badge>}
                  {triggerResult.emailError && <Badge variant="red" dot>Email Failed: {triggerResult.emailError}</Badge>}
                </div>
              )}
            </div>
          )}
          {emailResult && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              emailResult.success
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30'
            }`}>
              {emailResult.success
                ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                : <XCircle size={14} className="text-red-600 shrink-0" />}
              <span className={`text-xs ${emailResult.success ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                {emailResult.message}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Readiness Score (live only) ── */}
      {isLive && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-neutral-500" />
              <CardTitle>Workflow Readiness Score</CardTitle>
            </div>
            <span className={`text-xl font-bold ${readinessTextClass}`}>{readinessScore}%</span>
          </CardHeader>
          <div className="mb-4">
            <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${readinessBarClass}`} style={{ width: `${readinessScore}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px]">
              <span className="text-neutral-500">{readinessItems.filter((i) => i.status === 'green').length} of {readinessItems.length} checks passed</span>
              <span className={readinessTextClass}>{readinessSummary}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {readinessItems.map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'green' ? 'bg-emerald-500' : item.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex-1">{item.label}</span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 text-right truncate max-w-[220px]">{item.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Validation / Debug Panel ── */}
      <Card padding="none">
        <button
          onClick={() => setInspectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Bug size={14} className="text-neutral-500" />
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Validation / Debug Panel</span>
            {debugInfo ? <Badge variant="green" dot>Data loaded</Badge> : <Badge variant="gray">No data</Badge>}
          </div>
          {inspectorOpen ? <ChevronDown size={14} className="text-neutral-400" /> : <ChevronRight size={14} className="text-neutral-400" />}
        </button>
        {inspectorOpen && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 p-5 space-y-4">
            {debugInfo ? (
              <>
                {/* Object usage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">{debugInfo.documentSource === 'loan_document_types' ? 'DocumentType (loan-scoped)' : debugInfo.documentSource === 'document_type_catalog' ? 'DocumentType Catalog (name enrichment)' : 'Request Object'}</div>
                    <div className="text-xs font-mono text-neutral-800 dark:text-neutral-200">{debugInfo.requestObjectName}</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{debugInfo.requestObjectEndpoint}</div>
                    {debugInfo.requestObjectFields.length > 0 && (
                      <div className="text-[10px] text-neutral-400 mt-1">Fields: {debugInfo.requestObjectFields.slice(0, 8).join(', ')}{debugInfo.requestObjectFields.length > 8 ? ` +${debugInfo.requestObjectFields.length - 8}` : ''}</div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">Upload Object</div>
                    <div className="text-xs font-mono text-neutral-800 dark:text-neutral-200">{debugInfo.uploadedObjectName}</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{debugInfo.uploadedObjectEndpoint}</div>
                  </div>
                </div>

                {/* Missing fields */}
                {debugInfo.missingFields.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertOctagon size={12} className="text-amber-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Missing API Fields</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {debugInfo.missingFields.map((f) => <Badge key={f} variant="yellow">{f}</Badge>)}
                    </div>
                  </div>
                )}

                {/* API limitations */}
                {debugInfo.apiLimitations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle size={12} className="text-amber-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">API Limitations</span>
                    </div>
                    <div className="space-y-1">
                      {debugInfo.apiLimitations.map((l, i) => (
                        <div key={i} className="text-[11px] text-neutral-600 dark:text-neutral-400 flex items-start gap-1.5">
                          <span className="text-amber-500 shrink-0">•</span>
                          <span>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Match details */}
                {debugInfo.matchDetails.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Tag size={12} className="text-primary-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Match Methods</span>
                    </div>
                    <div className="space-y-1">
                      {debugInfo.matchDetails.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[160px]">{m.requestName}</span>
                          <Badge variant={
                            m.matchMethod === 'direct_id' ? 'green' :
                            m.matchMethod === 'document_type_id' ? 'green' :
                            m.matchMethod === 'category_id' ? 'blue' :
                            m.matchMethod === 'exact_name' ? 'blue' :
                            m.matchMethod === 'fuzzy_name' ? 'orange' :
                            'gray'
                          }>{matchMethodLabel(m.matchMethod)}</Badge>
                          <span className="text-neutral-400 truncate flex-1">{m.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw responses */}
                <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
                  <button
                    onClick={() => setInspectorTab('loan')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${inspectorTab === 'loan' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    {debugInfo.documentSource === 'loan_document_types' ? `Loan Doc Types (${debugInfo.rawRequestResponse.length})` : debugInfo.documentSource === 'document_type_catalog' ? `DocumentType Catalog (${debugInfo.rawRequestResponse.length})` : `Doc Requests (${debugInfo.rawRequestResponse.length})`}
                  </button>
                  <button
                    onClick={() => setInspectorTab('documents')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${inspectorTab === 'documents' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    Uploaded ({debugInfo.rawUploadResponse.length})
                  </button>
                </div>
                {inspectorTab === 'loan' ? (
                  debugInfo.rawRequestResponse.length > 0 ? (
                    <JsonViewer data={debugInfo.rawRequestResponse} maxHeight="360px" />
                  ) : (
                    <div className="text-sm text-neutral-500 text-center py-6">No {debugInfo.documentSource === 'loan_document_types' ? 'document types linked to this loan' : debugInfo.documentSource === 'document_type_catalog' ? 'uploaded documents found for this loan' : 'document request records returned'}.</div>
                  )
                ) : (
                  debugInfo.rawUploadResponse.length > 0 ? (
                    <JsonViewer data={debugInfo.rawUploadResponse} maxHeight="360px" />
                  ) : (
                    <div className="text-sm text-neutral-500 text-center py-6">No uploaded document records returned.</div>
                  )
                )}
              </>
            ) : (
              <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                {isLive ? 'Load a loan record to see API debug information.' : 'Debug information for simulated data will appear here.'}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── API Response Inspector (live only) ── */}
      {isLive && (
        <Card padding="none">
          <button
            onClick={() => setInspectorOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Code2 size={14} className="text-neutral-500" />
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">API Response Inspector</span>
              {mergedRecord ? <Badge variant="green" dot>Records loaded</Badge> : <Badge variant="gray">No data</Badge>}
            </div>
            {inspectorOpen ? <ChevronDown size={14} className="text-neutral-400" /> : <ChevronRight size={14} className="text-neutral-400" />}
          </button>
          {inspectorOpen && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 p-5">
              {mergedRecord ? (
                <>
                  <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg mb-4 w-fit">
                    {(['loan', 'contact', 'documents'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setInspectorTab(tab)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          inspectorTab === tab
                            ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700'
                        }`}
                      >
                        {tab === 'loan'
                          ? `Loan (${Object.keys(rawLoanRecord ?? {}).length} fields)`
                          : tab === 'contact'
                          ? `Contact (${Object.keys(rawContactRecord ?? {}).length} fields)`
                          : `Documents (${loanDocuments?.length ?? 0})`}
                      </button>
                    ))}
                  </div>
                  {loadMeta && inspectorTab !== 'documents' && (
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <Badge variant="blue">GET</Badge>
                      <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                        {inspectorTab === 'loan' ? loadMeta.loanEndpoint : (loadMeta.contactEndpoint ?? '—')}
                      </span>
                      <Badge variant="green">200 OK</Badge>
                    </div>
                  )}
                  {loadMeta && inspectorTab === 'documents' && (
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <Badge variant="blue">GET</Badge>
                      <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">{loadMeta.docsEndpoint ?? '—'}</span>
                      <Badge variant="green">200 OK</Badge>
                    </div>
                  )}
                  {inspectorTab === 'documents' ? (
                    loanDocuments && loanDocuments.length > 0 ? (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {loanDocuments.map((doc) => (
                          <div key={doc.id} className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{doc.documentType || '—'}</span>
                              <Badge variant="gray">id: {doc.id}</Badge>
                            </div>
                            <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">{doc.fileName}</div>
                            {doc.addedDate && <div className="text-[10px] text-neutral-400 mt-0.5">{new Date(doc.addedDate).toLocaleDateString()}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">No documents found for this loan.</div>
                    )
                  ) : (
                    <JsonViewer
                      data={inspectorTab === 'loan' ? (rawLoanRecord ?? {}) : (rawContactRecord ?? {})}
                      maxHeight="420px"
                    />
                  )}
                </>
              ) : (
                <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                  Load a loan record above to inspect the raw API responses.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

    </div>
  );
}
