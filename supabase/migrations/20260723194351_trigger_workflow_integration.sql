/*
# Trigger Builder + Workflow Validator Integration with Resend Email

## Purpose
Enhances the trigger system so triggers can be enabled/disabled per workflow,
carry their own email templates, and log every notification sent through Resend.

## Changes to trigger_definitions table
- `enabled` (boolean, default false): on/off toggle so triggers can be activated
  without deleting them
- `workflow` (text, nullable): which workflow this trigger belongs to — 'loan_intake'
  for Loan Intake Follow-Up, 'servicing_ticklers' for Servicing Ticklers. NULL means
  the trigger is not yet assigned to a workflow.
- `recipient_type` (text, default 'borrower'): who receives the notification —
  'borrower', 'internal', or 'bdo' (assigned loan officer)
- `email_subject` (text, nullable): subject line template with placeholder variables
- `email_body` (text, nullable): message body template with placeholder variables
- `trigger_event` (text, nullable): what event causes this trigger to fire —
  'no_docs_in_x_days', 'docs_uploaded', 'tickler_overdue', 'tickler_upcoming',
  'tickler_escalation', 'tickler_completion'

## New Table: notification_log
Records every email/notification attempt sent through the system via Resend.
- `id` (uuid, primary key)
- `created_at` (timestamp, defaults to now)
- `trigger_id` (uuid, nullable, references trigger_definitions — nullable so logs
  survive even if the trigger is later deleted)
- `trigger_name` (text): name of the trigger that fired (denormalized for readability)
- `recipient` (text): email address the message was sent to
- `recipient_type` (text): borrower / internal / bdo
- `subject` (text): email subject line
- `body` (text): email body content
- `notification_type` (text): email / teams / email+teams
- `status` (text): 'sent' / 'failed'
- `error_message` (text, nullable): error details if the send failed
- `provider_id` (text, nullable): Resend message ID on success
- `context` (jsonb): additional context (loan number, borrower name, workflow, etc.)

## Security
- RLS enabled on notification_log with anon+authenticated CRUD (single-tenant app, no auth)
- All policies use TO anon, authenticated with USING(true) / WITH CHECK(true)
  because this is a no-auth single-tenant app where data is intentionally shared

## Idempotency
- All ALTER TABLE statements use DO $$ ... IF NOT EXISTS ... END $$ blocks
- All CREATE TABLE use IF NOT EXISTS
- Policies are dropped before re-creating
*/

-- Add new columns to trigger_definitions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'enabled') THEN
    ALTER TABLE trigger_definitions ADD COLUMN enabled boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'workflow') THEN
    ALTER TABLE trigger_definitions ADD COLUMN workflow text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'recipient_type') THEN
    ALTER TABLE trigger_definitions ADD COLUMN recipient_type text DEFAULT 'borrower';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'email_subject') THEN
    ALTER TABLE trigger_definitions ADD COLUMN email_subject text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'email_body') THEN
    ALTER TABLE trigger_definitions ADD COLUMN email_body text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_definitions' AND column_name = 'trigger_event') THEN
    ALTER TABLE trigger_definitions ADD COLUMN trigger_event text;
  END IF;
END $$;

-- Create notification_log table
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  trigger_id uuid REFERENCES trigger_definitions(id) ON DELETE SET NULL,
  trigger_name text,
  recipient text,
  recipient_type text,
  subject text,
  body text,
  notification_type text DEFAULT 'email',
  status text DEFAULT 'pending',
  error_message text,
  provider_id text,
  context jsonb DEFAULT '{}'
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notification_log" ON notification_log;
CREATE POLICY "anon_select_notification_log" ON notification_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notification_log" ON notification_log;
CREATE POLICY "anon_insert_notification_log" ON notification_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notification_log" ON notification_log;
CREATE POLICY "anon_update_notification_log" ON notification_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notification_log" ON notification_log;
CREATE POLICY "anon_delete_notification_log" ON notification_log FOR DELETE
  TO anon, authenticated USING (true);

-- Add indexes for querying
CREATE INDEX IF NOT EXISTS idx_notification_log_trigger_id ON notification_log(trigger_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at DESC);
