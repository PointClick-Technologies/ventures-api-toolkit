import type { TriggerDefinition } from '../types';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  triggerId?: string;
  triggerName?: string;
  recipientType?: string;
  notificationType?: string;
  context?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  providerId?: string;
  logId?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return { success: false, error: data.error || `Request failed (${response.status})` };
    }

    return {
      success: true,
      providerId: data.providerId,
      logId: data.logId,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function renderTemplate(template: string, context: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const val = context[key];
    if (val === undefined || val === null) return match;
    return String(val);
  });
}

export interface TriggerContext {
  [key: string]: string | number | undefined;
  borrower_name?: string;
  borrower_email?: string;
  log_number?: string;
  loan_id?: string;
  assigned_bdo?: string;
  missing_documents?: string;
  uploaded_documents?: string;
  document_categories?: string;
  days_inactive?: number;
  threshold?: number;
  current_status?: string;
  tickler_name?: string;
  tickler_due_date?: string;
  tickler_owner?: string;
}

export function evaluateTrigger(
  trigger: TriggerDefinition,
  context: {
    status: string;
    daysSinceActivity: number;
    threshold: number;
    missingDocsCount: number;
    hasUploadedDocs: boolean;
    documentCategories: string[];
  },
): { fires: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const event = trigger.trigger_event;

  if (event === 'no_docs_in_x_days') {
    const statusMatch = context.status === 'Documents Pending';
    const docsMissing = context.missingDocsCount > 0;
    const activityStale = context.daysSinceActivity > context.threshold;

    reasons.push(statusMatch ? '✓ Status = Documents Pending' : `✗ Status = "${context.status}" (expected "Documents Pending")`);
    reasons.push(docsMissing ? `✓ ${context.missingDocsCount} required document(s) missing` : '✗ All required documents uploaded');
    reasons.push(activityStale ? `✓ ${context.daysSinceActivity} days since last activity (threshold: ${context.threshold})` : `✗ ${context.daysSinceActivity} day(s) since last activity (threshold: ${context.threshold})`);

    return { fires: statusMatch && docsMissing && activityStale, reasons };
  }

  if (event === 'docs_uploaded') {
    const hasDocs = context.hasUploadedDocs;
    reasons.push(hasDocs ? `✓ Documents uploaded (${context.documentCategories.length} categorized)` : '✗ No documents uploaded yet');
    return { fires: hasDocs, reasons };
  }

  return { fires: false, reasons: ['Unknown trigger event type'] };
}

export function resolveRecipient(
  trigger: TriggerDefinition,
  context: TriggerContext,
): { email: string; label: string } | null {
  switch (trigger.recipient_type) {
    case 'borrower':
      if (!context.borrower_email) return null;
      return { email: context.borrower_email, label: `Borrower (${context.borrower_name || context.borrower_email})` };
    case 'internal':
      return { email: 'lending-team@example.com', label: 'Internal Team (lending-team@example.com)' };
    case 'bdo':
      return { email: 'lending-team@example.com', label: `BDO (${context.assigned_bdo || 'unassigned'})` };
    default:
      return null;
  }
}
