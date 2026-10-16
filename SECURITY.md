# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Ventures API Toolkit, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Email your findings to security@pointclick.net.
3. Include a clear description of the vulnerability, steps to reproduce, and potential impact.
4. Allow up to 72 hours for an initial response.

We will acknowledge your report, investigate, and work with you on a fix. Responsible disclosure will be credited (if desired).

## Security Architecture

### Credentials

- All API credentials are managed via environment variables (`.env`) and edge function secrets.
- No secrets, keys, passwords, or tokens are hard-coded in the source.
- The `.env` file is listed in `.gitignore` and should never be committed.

### JWT Handling

- Ventures API JWTs are never exposed to the browser. The `ventures-proxy` edge function intercepts token responses, stores the JWT server-side in a database table with RLS enabled and no policies (inaccessible from the client), and returns an opaque session UUID to the browser.
- Subsequent API calls carry the session UUID, which the proxy resolves back to the real JWT before forwarding to Ventures.

### Database

- Row Level Security (RLS) is enabled on all tables.
- The app uses a single-tenant (no-auth) model where data is intentionally shared across the `anon` and `authenticated` roles.
- The `ventures_sessions` table has RLS enabled with no policies — only the service-role key (used by edge functions) can access it.

### Email

- Email sending uses Resend via an edge function. The Resend API key is stored as an edge function secret, never in client-side code.
- Notifications are simulated by default. Real emails require explicit configuration of the `RESEND_API_KEY` secret.

### API Proxy

- All Ventures API calls route through the Supabase edge function proxy, which handles authentication and keeps the real JWT server-side.
- The proxy enforces session validation and returns generic error messages without exposing internal details.

## Best Practices for Deployment

- Use strong, unique credentials for your Ventures API account.
- Regularly rotate your Supabase service role key and edge function secrets.
- Restrict CORS origins in production if the toolkit is not publicly accessible.
- Monitor API logs for unusual activity.
- Keep your Supabase project and edge function runtime up to date.
