# Ventures API Toolkit

A client-neutral, open-source toolkit for validating and exploring the [Ventures](https://venturesgo.com) API. Built by [PointClick Technologies](https://pointclicktech.com).

## What It Is

The Ventures API Toolkit is an engineering proof-of-concept environment for validating Ventures API capabilities before building production automation. It lets you authenticate against any Ventures instance, discover available objects and fields, test read/write operations, validate workflow logic, and generate readiness reports — all without modifying production data unless you explicitly choose to.

The toolkit is designed to be reusable across any organization using a Ventures-based platform. Switching between organizations is as simple as changing the site configuration profile.

## Features

### Dashboard
Overview of API activity, connection status, and toolkit modules with quick navigation to each section.

### Connection Manager
Authenticate against a Ventures API instance, monitor token expiry, and debug request URLs. Credentials are managed via environment variables — never hard-coded.

### API Explorer
Discover and inspect Ventures API objects, their fields, and supported operations. Browse the full object catalog and drill into individual object schemas.

### Object Browser
Browse, search, and filter records from any Ventures API object. View raw JSON responses and paginate through results.

### Workflow Validator
Three workflow prototypes for testing automation logic:

1. **Loan Intake Follow-Up** — Simulates the document-pending workflow: load a loan, fetch document requests, match uploaded documents, classify them with AI, and test trigger conditions.
2. **Servicing Ticklers** — Simulates tickler reminder actions (upcoming, overdue, escalation, completion) with optional email sending.
3. **API Discovery** — Automated probe of the Ventures API to answer engineering questions about available objects, supported operations, and relationships.

### Trigger Builder
Create and store trigger definitions with conditions, email templates, and notification types. Triggers can be enabled/disabled per workflow and tested from the Workflow Validator.

### Notification Simulator
Preview borrower emails, internal alerts, Teams notifications, and task assignments without sending them. Email tabs support live sending via Resend for testing.

### Writeback Tester
Test write operations (create, update, delete) against the Ventures API with full request/response logging.

### API Logs
Every API request is logged with method, endpoint, status code, duration, and error details. Export logs for analysis.

### Reports & Readiness
Generates a CRM configuration report with a workflow readiness score based on object capability testing. Export as Markdown or print to PDF.

### Settings
Manage site profiles for multiple Ventures instances. Each profile stores a base URL, site name, and display name.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide React icons
- **Backend:** Supabase (PostgreSQL, Edge Functions, Auth)
- **API Proxy:** Supabase Edge Function (Deno) — keeps Ventures JWTs server-side
- **Email:** Resend API via Edge Function
- **AI Classification:** OpenAI API via Edge Function

## Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A Ventures API account (for live mode)

### Installation

```bash
git clone https://github.com/your-org/ventures-api-toolkit.git
cd ventures-api-toolkit
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_VENTURES_BASE_URL` | Ventures API base URL |
| `VITE_VENTURES_SITE` | Your site/client identifier |
| `VITE_VENTURES_USERNAME` | Ventures API username |
| `VITE_VENTURES_PASSWORD` | Ventures API password |

### Running Migrations

The database schema is defined in `supabase/migrations/`. Apply them through your Supabase dashboard (SQL Editor) or the Supabase MCP tools:

1. `ventures_toolkit_schema.sql` — Core tables (api_logs, capability_results, trigger_definitions, site_profiles, etc.)
2. `ventures_sessions.sql` — Server-side session token storage
3. `document_classification_schema.sql` — AI-assisted document classification tables
4. `trigger_workflow_integration.sql` — Trigger system enhancement + notification log

### Deploying Edge Functions

Three edge functions are included under `supabase/functions/`:

- **ventures-proxy** — Proxies API requests and keeps JWTs server-side
- **send-email** — Sends email notifications via Resend
- **document-classify** — AI-assisted document classification via OpenAI

Deploy through the Supabase dashboard or MCP tools. Configure these edge function secrets:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Automatically provided by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase dashboard |
| `RESEND_API_KEY` | Resend API key (for email) |
| `RESEND_FROM_EMAIL` | From email address |
| `RESEND_FROM_NAME` | From display name |
| `OPENAI_API_KEY` | OpenAI API key (for document classification) |

### Running the App

```bash
npm run dev
```

The app runs in simulation mode by default. To connect to a live Ventures API, fill in the environment variables and use the Connection Manager page.

## Security Notes

- **No secrets in source control.** All credentials are managed via environment variables and edge function secrets. The `.env` file is gitignored.
- **JWTs never reach the browser.** The ventures-proxy edge function intercepts token responses and stores JWTs server-side, returning opaque session IDs to the browser.
- **Row Level Security** is enabled on all database tables. The app uses a single-tenant (no-auth) model where data is intentionally shared.
- **No production data is modified** without explicit intent. The toolkit is read-only by default; write operations require deliberate action in the Writeback Tester.
- **Email sending is opt-in.** Notifications are simulated by default. Real emails require a configured Resend API key.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## Security

See [SECURITY.md](SECURITY.md) for information on reporting security vulnerabilities.

## License

MIT License — Copyright (c) 2026 PointClick Technologies. See [LICENSE](LICENSE) for details.
