-- API Logs
CREATE TABLE IF NOT EXISTS api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL,
  headers jsonb,
  payload jsonb,
  response_body jsonb,
  status_code int,
  duration_ms int,
  error text,
  site_name text
);
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_api_logs" ON api_logs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_api_logs" ON api_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_api_logs" ON api_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_api_logs" ON api_logs FOR DELETE TO anon USING (true);

-- Capability Results
CREATE TABLE IF NOT EXISTS capability_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  site_name text NOT NULL,
  object_name text NOT NULL,
  can_read boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_update boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  read_error text,
  create_error text,
  update_error text,
  delete_error text,
  notes text,
  UNIQUE(site_name, object_name)
);
ALTER TABLE capability_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_capability_results" ON capability_results FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_capability_results" ON capability_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_capability_results" ON capability_results FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_capability_results" ON capability_results FOR DELETE TO anon USING (true);

-- Trigger Definitions
CREATE TABLE IF NOT EXISTS trigger_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  data_source text NOT NULL,
  required_fields text[] DEFAULT '{}',
  condition_field text,
  condition_operator text,
  condition_value text,
  delay_minutes int DEFAULT 0,
  notification_type text,
  escalation_rule text,
  writeback_required boolean DEFAULT false,
  site_name text,
  notes text
);
ALTER TABLE trigger_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_trigger_definitions" ON trigger_definitions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_trigger_definitions" ON trigger_definitions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_trigger_definitions" ON trigger_definitions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_trigger_definitions" ON trigger_definitions FOR DELETE TO anon USING (true);

-- Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  type text NOT NULL,
  subject text,
  body text,
  variables jsonb DEFAULT '{}',
  site_name text
);
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_notification_templates" ON notification_templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_notification_templates" ON notification_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_notification_templates" ON notification_templates FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_notification_templates" ON notification_templates FOR DELETE TO anon USING (true);

-- Site Profiles
CREATE TABLE IF NOT EXISTS site_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  base_url text NOT NULL,
  site_name text NOT NULL,
  is_active boolean DEFAULT false,
  last_connected_at timestamptz,
  notes text
);
ALTER TABLE site_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_site_profiles" ON site_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_site_profiles" ON site_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_site_profiles" ON site_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_site_profiles" ON site_profiles FOR DELETE TO anon USING (true);

-- Writeback Attempts
CREATE TABLE IF NOT EXISTS writeback_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  operation text NOT NULL,
  object_name text,
  record_id text,
  request_payload jsonb,
  response_body jsonb,
  status_code int,
  success boolean DEFAULT false,
  error text,
  site_name text
);
ALTER TABLE writeback_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_writeback_attempts" ON writeback_attempts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_writeback_attempts" ON writeback_attempts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_writeback_attempts" ON writeback_attempts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_writeback_attempts" ON writeback_attempts FOR DELETE TO anon USING (true);
