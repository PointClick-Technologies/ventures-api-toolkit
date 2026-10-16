export interface FieldConfig {
  key: string;
  label: string;
  venturesObject: string;
  candidates: string[];
  note?: string;
}

// Field candidates are ordered by likelihood based on the actual Ventures Loan object fields.
// Loan uses camelCase (e.g. loanStatus, submittalDate, updatedDate).
// Borrower contact fields come from the merged Contact record fetched via primaryContactId.
export const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: 'applicationId',
    label: 'Loan Log Number',
    venturesObject: 'Loan',
    candidates: ['logNumber', 'referenceNumber', 'sbaLoanNumber', 'id', 'uuid'],
  },
  {
    key: 'borrowerName',
    label: 'Borrower Name',
    venturesObject: 'Loan',
    // referenceName is the business/borrower name on the Loan record itself.
    // firstName/lastName come from the merged Contact record.
    candidates: ['referenceName', 'name', 'firstName', 'lastName', 'businessName'],
  },
  {
    key: 'borrowerEmail',
    label: 'Borrower Email',
    venturesObject: 'Contact',
    // Email lives on the linked Contact record (fetched via primaryContactId).
    candidates: ['email', 'borrowerEmail', 'contactEmail'],
    note: 'Fetched from linked Contact via primaryContactId',
  },
  {
    key: 'applicationStatus',
    label: 'Loan Status',
    venturesObject: 'Loan',
    candidates: ['loanStatus', 'loanSubStatus', 'status'],
  },
  {
    key: 'assignedBDO',
    label: 'Assigned BDO',
    venturesObject: 'LoanPartner',
    // loanPartnerName is injected from the LoanPartner list call (roleType=LoanOfficer).
    // Direct Loan fields do not carry officer name.
    candidates: ['loanPartnerName', 'officerName', 'assignedOfficer', 'loanOfficer', 'bdoName', 'owner'],
    note: 'Fetched from LoanPartner where roleType=LoanOfficer (requires loanId filter)',
  },
  {
    key: 'submissionDate',
    label: 'Submission Date',
    venturesObject: 'Loan',
    candidates: ['submittalDate', 'addedDate', 'approvalDate', 'closingDate'],
  },
  {
    key: 'lastActivityDate',
    label: 'Last Activity Date',
    venturesObject: 'Loan',
    candidates: ['updatedDate', 'addedDate', 'fundedDate', 'closingDate'],
  },
  {
    key: 'currentStage',
    label: 'Current Stage',
    venturesObject: 'Loan',
    candidates: ['loanSubStatus', 'loanStatus', 'loanType'],
  },
  {
    key: 'uploadedDocuments',
    label: 'Uploaded Documents',
    venturesObject: 'LoanDocument',
    candidates: ['documents', 'loanDocuments', 'attachments', 'files'],
    note: 'Requires separate LoanDocument list call with loanId filter',
  },
  {
    key: 'requiredDocuments',
    label: 'Required Documents',
    venturesObject: 'LoanDocument',
    candidates: ['requiredDocuments', 'documentChecklist', 'checklist'],
    note: 'Not available via API; managed as business logic',
  },
];

export interface MappedApplicationData {
  applicationId?: string;
  borrowerName?: string;
  borrowerEmail?: string;
  applicationStatus?: string;
  assignedBDO?: string;
  submissionDate?: string;
  lastActivityDate?: string;
  currentStage?: string;
  uploadedDocuments?: string[];
  requiredDocuments?: string[];
}

export function extractField(record: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    if (c in record && record[c] !== null && record[c] !== undefined && record[c] !== '') {
      return record[c];
    }
  }
  return undefined;
}

function toStr(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  return s || undefined;
}

function toStrArr(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const arr = val.map((v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return toStr(o.name ?? o.title ?? o.document_name ?? o.filename) ?? JSON.stringify(v);
    }
    return String(v);
  });
  return arr.length > 0 ? arr : undefined;
}

export function mapApplicationRecord(
  record: Record<string, unknown>,
  overrides: Record<string, string> = {}
): MappedApplicationData {
  function get(key: string): unknown {
    const fc = FIELD_CONFIGS.find((f) => f.key === key)!;
    const override = overrides[key]?.trim();
    const candidates = override ? [override, ...fc.candidates] : fc.candidates;
    return extractField(record, candidates);
  }

  return {
    applicationId:     toStr(get('applicationId')),
    borrowerName:      toStr(get('borrowerName')),
    borrowerEmail:     toStr(get('borrowerEmail')),
    applicationStatus: toStr(get('applicationStatus')),
    assignedBDO:       toStr(get('assignedBDO')),
    submissionDate:    toStr(get('submissionDate')),
    lastActivityDate:  toStr(get('lastActivityDate')),
    currentStage:      toStr(get('currentStage')),
    uploadedDocuments: toStrArr(get('uploadedDocuments')),
    requiredDocuments: toStrArr(get('requiredDocuments')),
  };
}
