/*
# Create ventures_sessions table

## Purpose
Stores Ventures API session tokens server-side so the real Ventures JWT
never leaves the edge function. The proxy intercepts the /api/v4/token
endpoint response, saves the JWT here, and returns an opaque UUID (session ID)
to the browser instead. Subsequent API calls carry the UUID in X-Session-ID;
the proxy resolves it back to the real JWT before forwarding to Ventures.

## New Tables
- `ventures_sessions`
  - `id` (uuid, primary key) — the opaque session ID returned to the browser
  - `jwt` (text, not null) — the real Ventures Bearer JWT, stored server-side only
  - `expires_at` (timestamptz, not null) — mirrors the Ventures token expiry (1 hour)
  - `created_at` (timestamptz, default now())

## Security
- RLS is enabled but NO policies are added.
- The table is intentionally inaccessible from the anon/authenticated client roles.
- The edge function accesses it exclusively via the service-role key, which bypasses RLS.
- This ensures the Ventures JWT can never be read from the browser.
*/

CREATE TABLE IF NOT EXISTS ventures_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jwt        text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ventures_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role key (edge function) may access this table.
