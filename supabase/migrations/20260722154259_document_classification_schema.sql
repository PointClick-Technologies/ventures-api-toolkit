/*
# AI-Assisted Document Classification Schema

## Purpose
Supports the Loan Intake Follow-Up workflow (Workflow Validator > Workflow 1)
by replacing the broken keyword-substring document matcher with a two-tier
classifier: (1) a curated deterministic rule table that maps Ventures
documentType values to canonical required-doc categories, and (2) an OpenAI
structured-output edge function fallback for documents the rules can't resolve
(empty documentType, novel types, filename-only uploads). All classifications
are cached durably so repeat loan loads don't re-bill OpenAI and a human can
review/override before results drive the trigger logic.

## New Tables

1. document_categories
   - The global, fixed required-document checklist for the Loan Intake workflow.
   - One row per canonical category (e.g. "Business Plan", "Tax Returns (2yr)").
   - display_order controls rendering order in the UI.

2. document_category_rules
   - Curated deterministic mapping from a Ventures documentType pattern to a
     canonical category.
   - pattern is matched case-insensitively as a substring against the
     documentType returned by the LoanDocument API.
   - excludes = false  → this documentType SATISFIES the target category.
   - excludes = true   → this documentType does NOT satisfy the target category
     (prevents false positives, e.g. "Business Credit Report" is NOT a "Business Plan").
   - priority controls evaluation order when multiple patterns could match.

3. document_classifications
   - Durable cache of every classification result (rule-based and LLM-based).
   - Primary key on (loan_id, document_id) so repeat loan loads hit the cache
     instead of re-calling OpenAI.
   - source = 'rule' | 'llm' | 'override'.
   - review_status = 'auto' | 'verified' | 'overridden'.
   - confidence 0..1 (1.0 for deterministic rules, model-reported for LLM).
   - reason holds a short explanation (LLM one-liner, or which rule matched).

## Security
- Single-tenant app (no sign-in). RLS enabled on all three tables with
  anon+authenticated full CRUD, consistent with the existing ventures_toolkit
  tables (api_logs, capability_results, etc.).

## Notes
- document_categories is global (not keyed by loan type) per product decision.
- The five seed categories mirror the existing DOCS_REQUIRED constant in
  LoanIntakeFlow.tsx so the trigger logic stays consistent.
- Seed rules cover the false-positive and false-negative cases encountered in
  Ventures documentType values (credit reports vs. business plan / personal financial statement;
  singular "Tax Return" vs. plural "Tax Returns").
*/

-- ── document_categories ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  label text NOT NULL UNIQUE,
  display_order int NOT NULL DEFAULT 0
);
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_document_categories" ON document_categories;
CREATE POLICY "anon_select_document_categories" ON document_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_document_categories" ON document_categories;
CREATE POLICY "anon_insert_document_categories" ON document_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_document_categories" ON document_categories;
CREATE POLICY "anon_update_document_categories" ON document_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_document_categories" ON document_categories;
CREATE POLICY "anon_delete_document_categories" ON document_categories FOR DELETE TO anon, authenticated USING (true);

-- ── document_category_rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  pattern text NOT NULL,
  category_label text NOT NULL REFERENCES document_categories(label) ON DELETE CASCADE,
  excludes boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100
);
ALTER TABLE document_category_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_document_category_rules" ON document_category_rules;
CREATE POLICY "anon_select_document_category_rules" ON document_category_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_document_category_rules" ON document_category_rules;
CREATE POLICY "anon_insert_document_category_rules" ON document_category_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_document_category_rules" ON document_category_rules;
CREATE POLICY "anon_update_document_category_rules" ON document_category_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_document_category_rules" ON document_category_rules;
CREATE POLICY "anon_delete_document_category_rules" ON document_category_rules FOR DELETE TO anon, authenticated USING (true);

-- ── document_classifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  loan_id text NOT NULL,
  document_id text NOT NULL,
  document_type text,
  file_name text,
  matched_category text,
  confidence numeric NOT NULL DEFAULT 1.0,
  source text NOT NULL DEFAULT 'rule',
  reason text,
  review_status text NOT NULL DEFAULT 'auto',
  UNIQUE(loan_id, document_id)
);
ALTER TABLE document_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_document_classifications" ON document_classifications;
CREATE POLICY "anon_select_document_classifications" ON document_classifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_document_classifications" ON document_classifications;
CREATE POLICY "anon_insert_document_classifications" ON document_classifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_document_classifications" ON document_classifications;
CREATE POLICY "anon_update_document_classifications" ON document_classifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_document_classifications" ON document_classifications;
CREATE POLICY "anon_delete_document_classifications" ON document_classifications FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_document_classifications_loan ON document_classifications(loan_id);

-- ── Seed: canonical categories (mirror DOCS_REQUIRED in LoanIntakeFlow) ──
INSERT INTO document_categories (label, display_order) VALUES
  ('Business Plan', 1),
  ('Tax Returns (2yr)', 2),
  ('Bank Statements (6mo)', 3),
  ('Articles of Incorporation', 4),
  ('Personal Financial Statement', 5)
ON CONFLICT (label) DO UPDATE SET display_order = EXCLUDED.display_order;

-- ── Seed: deterministic rules ────────────────────────────────────────
-- Covers common Ventures documentType values from LoanDocument API data.
-- excludes=true prevents the two known false positives:
--   "Business Credit Report" ≠ "Business Plan"
--   "Personal Credit Report" ≠ "Personal Financial Statement"
-- Fixes the false negative: singular "Tax Return" → "Tax Returns (2yr)"

INSERT INTO document_category_rules (pattern, category_label, excludes, priority) VALUES
  -- Tax returns (personal + business, singular + plural)
  ('tax return',   'Tax Returns (2yr)', false, 50),
  ('tax returns',  'Tax Returns (2yr)', false, 50),
  ('btr',          'Tax Returns (2yr)', false, 60),
  ('personal tax', 'Tax Returns (2yr)', false, 55),
  ('business tax', 'Tax Returns (2yr)', false, 55),

  -- Business plan
  ('business plan',   'Business Plan', false, 40),

  -- Bank statements
  ('bank statement',  'Bank Statements (6mo)', false, 40),
  ('bank statements', 'Bank Statements (6mo)', false, 40),

  -- Articles of incorporation
  ('articles of incorporation', 'Articles of Incorporation', false, 30),
  ('articles',                  'Articles of Incorporation', false, 70),
  ('incorporation',             'Articles of Incorporation', false, 70),

  -- Personal financial statement
  ('personal financial statement', 'Personal Financial Statement', false, 30),
  ('pfs',                          'Personal Financial Statement', false, 60),
  ('financial statement',          'Personal Financial Statement', false, 45),

  -- ── Explicit exclusions (false-positive prevention) ──
  ('credit report',       'Business Plan',              true, 20),
  ('bcr',                 'Business Plan',              true, 20),
  ('personal credit',     'Personal Financial Statement', true, 20),
  ('credit',              'Business Plan',              true, 15)
ON CONFLICT DO NOTHING;
