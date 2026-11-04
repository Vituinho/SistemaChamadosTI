# Givova TI — backend NestJS / Node.js

This is a **drop-in API migration**, not a new empty ticketing system. The existing frontend is already Next.js 16 and remains at ../givova-ti-frontend. The Python/FastAPI backend stays in ../backend strictly for rollback until the cutover is verified.

## Compatibility contract

- Existing PostgreSQL schema is reused as-is. Tables: technicians, sessions, tickets, ticket_history, attachments, push_subscriptions.
- Existing Argon2 password hashes are verified by the Node argon2 package; technicians do **not** need password resets.
- Existing SHA-256 session and tracking-key hashes are reused. Same cookie name and JSON fields.
- Endpoints: GET /health, /departments, /catalog, /auth/me, /dashboard, /tickets, /tickets/:id, /tickets/:id/history, /tickets/:id/attachment, /tracking/:protocol, /tracking/:protocol/attachment, /events, /tracking/:protocol/events, /push/config; POST /auth/login, /auth/logout, /tickets, /tickets/:id/assign, /tickets/:id/resolve, /push/subscribe, /push/unsubscribe, /push/test; PATCH /tickets/:id.
- Ticket updates use PostgreSQL transactions and row locks; attachments are inspected and recoded to WEBP by sharp. Login is limited per IP + username (avoids false lockouts when users share a cPanel proxy IP).
- Time zone for daily dashboard totals is America/Sao_Paulo. Browser cPanel export uses 15s polling and the existing PHP proxy.

## Local setup

Node.js 22 and an existing PostgreSQL schema with Python Alembic migrations through 0005 are required.

1. Copy .env.example to .env. Set DATABASE_URL to a *development* database with the existing schema. Never copy production secrets into Git.
2. npm install
3. npm run check
4. npm run dev (listens on PORT, default 8000)

Next frontend: cd ../givova-ti-frontend; npm ci; set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local; npm run dev.

For a fresh environment, run **legacy Alembic migrations through 0005 once** (using ../backend), then create a technician in Nest with CREATE_USER_PASSWORD=... npm run create-user after building. This script only inserts into technicians and never changes the schema. Existing users are retained automatically.

## Render deployment and safe cutover

1. Back up production PostgreSQL, including ticket attachments and sessions.
2. Create a **new** Render Node web service for this branch. Set root directory backend-nest, build npm install && npm run build, start npm start, health path /health. Do not replace the existing Python service yet.
3. Provide DATABASE_URL (matching existing schema after read-only verification), DATABASE_SSL as needed, ALLOWED_ORIGINS as JSON, COOKIE_SECURE=true, SESSION_HOURS=8, and the **existing** VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Keep keys private.
4. Test GET /health and /catalog. Use a disposable staging DB to exercise login, opening, assigning, resolving, image validation, logout and push notifications before switching real traffic. Confirm Argon2 hashes, existing tickets and linked history.
5. The cPanel static build uses /api and a narrow PHP proxy. **The ZIP defaults to the existing Python Render URL** so the current live service is not switched by extracting a ZIP. Once Nest is deployed and verified, change deploy/cpanel/api/config.php to the new fixed https://YOUR-NEST-SERVICE.onrender.com URL and rebuild the ZIP using python3 scripts/build_cpanel.py.
6. Keep the old API available for rollback; restore the former proxy URL if the new backend fails. Do not run unrelated destructive migrations.

The proxy validates the configured hostname against *.onrender.com; this is deliberate SSRF protection. For deployment on Railway, separately review and update both the backend URL and the fixed-hostname allowlist in deploy/cpanel/api/index.php.

## Build & tests

npm run check performs TypeScript compilation and validation contract tests. The repository's cPanel workflow also builds the frontend export and produces a ZIP artifact. These checks do **not** establish production DB, browser, or live Web Push compatibility; run a full staging smoke test before cutover.
