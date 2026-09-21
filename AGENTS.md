# Repository Guidelines

## Project Structure & Module Organization

Fit4Sure is a Node.js, Express 5, and PostgreSQL backend. `src/app.js` registers middleware and routes; `src/index.js` starts the server and scheduled jobs. API handlers live in `src/routes/`, with administrative endpoints in `src/routes/admin/`. Keep business logic and integrations in `src/services/`, shared helpers in `src/utils/`, and authentication middleware in `src/middleware/`. Database connection, schema, and seed files are in `src/config/`. Root-level scripts handle imports, migrations, and repairs; CSV/XLSX files are data exports. There is no dedicated test directory.

## Build, Test, and Development Commands

Use Node.js 20 LTS and PostgreSQL 12+ as documented in `README.md`.

- `npm install`: install dependencies.
- `cp .env.example .env`: create local configuration; fill in required values.
- `createdb fit4sure`: create the local database.
- `psql fit4sure -f src/config/schema.sql` and `psql fit4sure -f src/config/seed.sql`: initialize and seed a fresh local database.
- `npm run dev`: run with nodemon auto-restart.
- `npm start`: start the API on `PORT`, defaulting to 3000.
- `curl http://localhost:3000/health`: check server availability.

There is no build step or configured npm test/lint script.

## Coding Style & Naming Conventions

Use CommonJS (`require`, `module.exports`), two-space indentation, and camelCase for JavaScript functions, variables, and module filenames, such as `recipeCost.js`. Follow adjacent code for punctuation: core modules generally use single quotes and omit semicolons, while some scripts differ. No formatter or linter is configured. Use parameterized PostgreSQL queries and preserve existing API field names and authentication checks.

## Testing Guidelines

No automated framework or coverage threshold is configured. Verify changed endpoints locally, including success, invalid-input, and authorization cases. `node test-usda.js` exercises the live USDA integration and requires `USDA_API_KEY`. `bash test_reports.sh` requires a running server and replacement of its placeholder token with a valid admin token; inspect responses because its final message does not assert success. Existing checks use `test-*.js` and `test_*.sh` naming.

## Commit & Pull Request Guidelines

Recent commits use descriptive imperative subjects, such as “Fix systematic gram overestimation”; no mandatory prefix is evident. Keep changes focused. PRs should explain the problem, resulting behavior, validation performed, and any schema or configuration changes. Link relevant issues and include request/response examples for API changes.

## Fit4Sure Domain & Source of Truth

This backend operates a real meal-prep business. PostgreSQL and existing repository services are the operational source of truth. Never invent customer, order, recipe, macro, price, inventory, scheduling, or financial data. Keep recipe macros and portions consistent unless an authorized user explicitly changes the recipe or portion. Extend existing routes, services, tables, and workflows instead of creating duplicate systems.

## AI-Agent Boundaries

Agents may analyze, draft, calculate from verified data, and prepare actions. Human approval is required before publishing marketing, sending customer communications, spending money, changing production quantities, modifying food-safety information, or making legal/compliance decisions. Identify missing or unverified information instead of guessing. Keep agent prompts, tool permissions, model selection, and run history auditable without exposing sensitive data.

## Database & Production Safety

Use parameterized SQL and versioned, idempotent migrations for schema changes. Review import, repair, deletion, and migration scripts before execution; never run them against production without explicit authorization and a verified target. Default to a disposable local database, preserve existing data, and avoid destructive commands. Starting the server also activates scheduled automation and reporting jobs.

Keep secrets in the ignored `.env`. Never expose or commit secrets, customer information, authentication tokens, or populated environment files; `.env.example` must contain placeholders only.

## Working Method

Before changing code, trace the existing data flow and relevant routes/services. Keep changes focused and compatible with the admin dashboard. After changes, run applicable syntax/build checks (for example, `node --check src/app.js` for a changed JavaScript file) and relevant endpoint checks; report anything that could not be tested. No build command is currently configured. Do not claim deployment or successful live integration without evidence. Do not commit or push unless explicitly requested.

## Claude Code & Codex Interoperability

Keep repository instructions tool-neutral. `AGENTS.md` is the canonical coding-agent guide. Place detailed architecture and feature handoffs in repository Markdown files that both Codex and Claude Code can read.
