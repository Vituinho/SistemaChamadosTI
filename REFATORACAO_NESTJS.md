# Refatoração — Next.js + NestJS

- The frontend was already Next.js 16 / React 19 / TypeScript; no rewrite or feature removal was needed.
- The new code is under backend-nest. Legacy backend remains under backend for rollback, and production is not changed.
- API is intended to match legacy FastAPI routes, JSON responses, session cookie, ticket tracking access key, images, filters, dashboard, SSE and push.
- PostgreSQL tables stay exactly as implemented by Alembic 0001–0005, preserving data. Nest does not auto-synchronize or mutate the database schema.
- cPanel static packaging continues with scripts/build_cpanel.py, including the PHP same-origin proxy.
- **Important:** until a new Nest backend is deployed and the fixed proxy URL is changed, the cPanel archive will continue using the existing live Python backend. Do not describe the extraction alone as a completed backend migration.
- Staging smoke tests and a production backup are required before the final cutover. See backend-nest/README.md.
