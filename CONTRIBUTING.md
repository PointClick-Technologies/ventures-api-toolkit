# Contributing to Ventures API Toolkit

Thank you for your interest in contributing! This document covers the basics.

## Getting Started

1. Fork the repository and clone your fork.
2. Run `npm install` to install dependencies.
3. Copy `.env.example` to `.env` and fill in your values.
4. Run `npm run dev` to start the development server.

## Development

- **Type checking:** `npm run typecheck`
- **Linting:** `npm run lint`
- **Build:** `npm run build`

## Guidelines

- Follow the existing code style and conventions. The project uses TypeScript with strict typing, Tailwind CSS for styling, and Lucide React for icons.
- Do not hard-code secrets, credentials, or client-specific data. Use environment variables and neutral placeholders.
- Keep files at a manageable size. Split files when they become hard to navigate.
- Write clear commit messages describing what changed and why.
- Test your changes before submitting — run the type checker and build, and manually verify the affected pages.

## Database Changes

If your change requires schema modifications:

1. Create a new migration SQL file under `supabase/migrations/` with a descriptive name.
2. Follow the existing migration conventions (idempotent statements, RLS policies for all tables).
3. Never use `DROP` or `DELETE` on columns — those operations lose user data.
4. Test the migration against your Supabase project.

## Edge Functions

Edge function source lives under `supabase/functions/<slug>/index.ts`. All responses must include CORS headers. Use `Deno.env.get()` for secrets — never hard-code keys.

## Pull Requests

1. Create a feature branch from `main`.
2. Make your changes and commit them.
3. Ensure `npm run typecheck` and `npm run build` pass.
4. Open a pull request with a clear description of what changed and why.

## Reporting Issues

Use GitHub Issues to report bugs or request features. Include:

- A clear description of the problem or request
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Screenshots if applicable

## Code of Conduct

Be respectful and constructive. We welcome contributors of all backgrounds and experience levels.
