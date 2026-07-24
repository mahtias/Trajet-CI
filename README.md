# Trajet CI

A Progressive Web App for booking intercity bus tickets in Côte d'Ivoire — one platform covering **20 transport companies** (UTB, UTRAKO, UTNA, UTD, UTS, UTY, UTM, UTBG, UTG, UTF, UTT, UTDK, UTSS, SAMA Transport, STM, SOTRACO, Trans Bouaké, Trans Korhogo, West Trans CI, San-Pédro Express) instead of a single-carrier app.

Three roles share one login screen and one URL — what you see after logging in depends on your account's role:

| Role | Who | What they do |
|---|---|---|
| **Passenger** | Travelers | Search trips, pick a seat, pay, get a QR ticket |
| **Clerk** (Guichetier) | Gare/station staff | Manage today's departures, sell cash tickets, scan QR codes to board passengers |
| **Admin** | Platform operator | Manage companies/routes/trips, view sales, manage staff accounts |

## Table of contents

- [Features by role](#features-by-role)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started (local development)](#getting-started-local-development)
- [Seeding sample data](#seeding-sample-data)
- [The PWA — install & deploy](#the-pwa--install--deploy)
- [Deploying to production](#deploying-to-production)
- [Test accounts](#test-accounts)
- [Known limitations](#known-limitations)

## Features by role

### 🧑‍💼 Passenger

- Search trips by origin / destination / date, no login required to browse
- City autocomplete (searchable combobox) across all seeded destinations
- Seat map (40 seats, color-coded: available / reserved / sold), 10-minute temporary hold on selection
- Checkout with a choice of mobile money provider — **Wave, Orange Money, or MTN Money** (Wave first, since it's the most-used option in Côte d'Ivoire today)
- QR-code e-ticket generated on successful payment, viewable under "Mes billets"
- Bilingual UI — French / English toggle (passenger-facing pages)
- Installable as a home-screen app (PWA) with offline-friendly caching for previously-viewed pages
- Phone + OTP login doubles as signup — no separate registration form; a new phone number is automatically created as a `passenger` account on first login

### 🧑‍✈️ Clerk (Guichetier)

- Dashboard of the day's departures per route
- Real-time seat map for walk-up/cash sales (mark a seat "sold" manually)
- **Camera-based QR scanner** to validate a passenger's ticket at boarding (falls back to manual ticket-ID entry if the camera isn't available) — a ticket can only be validated once; re-scanning an already-boarded ticket is rejected
- Route/data access is scoped to what's needed for boarding operations; no access to admin screens

### 🛠️ Admin

- **Compagnies** — CRUD for the 20 (or more) bus companies
- **Lignes** — CRUD for routes (origin, destination, duration, company)
- **Voyages** — CRUD for scheduled trips (date, time, price), filterable by date, with cancel support
- **Rapports** — sales report with date range + company filters, CSV export, and revenue/ticket totals
- **Utilisateurs** — list every account and promote a passenger to `clerk` or `admin` (an admin can't demote their own account, to avoid accidental lockout)
- Dashboard with today/month ticket counts, revenue, and breakdowns by company and by day
- All five list screens are server-side paginated (20 rows/page) — the dataset is seeded with 7,000+ trips, so nothing tries to render an unbounded table

Every admin and clerk route is guarded both server-side (session + role check on the API) and client-side (redirects if you're logged out or logged in with the wrong role) — visiting `/admin` as a passenger, or without being logged in at all, bounces you away instead of rendering the page.

## Tech stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui + Wouter (routing) + TanStack Query
- **API:** Express 5 + Zod validation, session-based auth (`express-session`)
- **Database:** PostgreSQL + Drizzle ORM
- **API contract:** OpenAPI spec (`lib/api-spec/openapi.yaml`) is the source of truth; Orval generates the Zod validators and React Query hooks from it — never hand-edit the generated files
- **PWA:** `vite-plugin-pwa` (Workbox service worker, manifest, install prompt)
- **QR:** `qrcode` (server-side ticket generation), `jsqr` (client-side camera scanning)
- **Charts:** Recharts (admin dashboard)

## Project structure

```
artifacts/
  api-server/       Express API (routes, auth, payments, admin/clerk endpoints)
  utb-ticketing/     React/Vite frontend (passenger, clerk, admin UIs)
lib/
  api-spec/          openapi.yaml — the API contract (source of truth)
  api-zod/           Generated Zod schemas (do not hand-edit)
  api-client-react/  Generated React Query hooks (do not hand-edit)
  db/                Drizzle schema (companies, routes, trips, seats, tickets, users)
scripts/
  src/data/          Transcribed company/route/schedule data (20 companies)
  src/seed-companies.ts   Idempotent seed script
```

## Getting started (local development)

**Prerequisites:** Node.js 24 (or compatible), `pnpm` (`corepack enable pnpm` if you don't have it), and a PostgreSQL 16 instance (a local install or `docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trajet_ci -p 5433:5432 postgres:16` works fine).

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# then edit .env — DATABASE_URL and SESSION_SECRET

# 3. Push the database schema
pnpm --filter @workspace/db run push

# 4. (Optional but recommended) Seed all 20 companies' routes/schedules
pnpm --filter @workspace/scripts run seed:companies

# 5. Run the API and the frontend in two terminals
PORT=8080 pnpm --filter @workspace/api-server run dev
PORT=24273 BASE_PATH=/ pnpm --filter @workspace/utb-ticketing run dev
```

Then open **http://localhost:24273**.

Useful workspace-wide commands:

```bash
pnpm run typecheck   # typecheck every package
pnpm run build       # typecheck + build every package
pnpm --filter @workspace/api-spec run codegen   # regenerate API hooks/schemas after editing openapi.yaml
```

## Seeding sample data

`pnpm --filter @workspace/scripts run seed:companies` loads all 20 companies, their routes, and 14 days of scheduled trips from `scripts/src/data/transport-companies.ts` (transcribed from real published fares/schedules). It's idempotent — re-running it won't create duplicates, and it's safe to run against a database that already has some data (e.g. it'll reuse an existing "UTB" company row instead of creating a second one).

## The PWA — install & deploy

The frontend is an installable PWA: it ships a web app manifest, custom icons, and a Workbox-generated service worker (`artifacts/utb-ticketing/vite.config.ts`).

**Important:** the service worker only activates on a **production build**, not `pnpm dev`. To see the real install/offline behavior:

```bash
cd artifacts/utb-ticketing
pnpm run build
PORT=24273 BASE_PATH=/ pnpm run serve
```

Then, in Chrome DevTools → Application tab, you should see the manifest (name, icons, theme color) and an activated service worker. In the browser address bar, an install icon appears when the criteria are met.

**HTTPS is required** for both the install prompt and the camera-based QR scanner (`getUserMedia`) to work — browsers only allow these on a secure context (`https://` or `localhost`). Testing over plain `http://<lan-ip>` (e.g. from a phone on the same network) will not show the install option and the camera scanner will fail with a permission error.

- **Android (Chrome):** open the site → ⋮ menu → "Install app" (or the automatic install banner)
- **iPhone (Safari):** open the site → Share icon → "Add to Home Screen" (iOS has no automatic install prompt — this is a platform limitation, not an app bug)

## Deploying to production

This project isn't tied to a specific host — it's a standard pnpm monorepo with two runtime pieces:

1. **API server** (`artifacts/api-server`) — a Node process. Build with `pnpm --filter @workspace/api-server run build`, run with `pnpm --filter @workspace/api-server run start`. Needs `DATABASE_URL` and `SESSION_SECRET`, and a `PORT`.
2. **Frontend** (`artifacts/utb-ticketing`) — a static build (`pnpm --filter @workspace/utb-ticketing run build` → `dist/public`). Needs `PORT`/`BASE_PATH` at build time.

The frontend calls `/api/...` as same-origin relative paths, so whatever you deploy to needs to serve the built frontend **and** proxy `/api/*` to the API server under the same domain (a reverse proxy / load balancer path rule, or a platform's built-in app router). For local development, `vite.config.ts` already has a dev-only proxy (`server.proxy` / `preview.proxy`) pointing `/api` at `http://localhost:8080` — mirror that same routing rule (frontend static assets + `/api` → API server) on whatever you deploy to.

Because of the HTTPS requirement above, any real deployment needs TLS — most hosts (Vercel, Render, Fly.io, a VPS behind Caddy/nginx with Let's Encrypt, etc.) provide this by default.

## Test accounts

Dev/test-only — OTP codes are echoed back in the API response instead of sent by SMS (`devOtp` field), and the login page auto-fills them for convenience.

| Role | Phone |
|---|---|
| Admin | `+2250700000001` |
| Clerk | `+2250700000002` |
| Passenger | `+2250700000003` |

## Known limitations

- **Payments are simulated.** Wave, Orange Money, and MTN Money are all selectable at checkout, but none call a real provider API — `/api/payments/initiate` creates a pending ticket and `/api/payments/callback` marks it paid, with no merchant integration behind it. Wiring in real payment APIs requires merchant credentials from each provider.
- **SMS is not wired up.** OTP codes are returned directly in the API response (`devOtp`) for development; a real deployment needs an SMS provider (Twilio, Orange SMS API, etc.) in `auth.ts`.
- **No self-service staff signup.** Promoting an account to `clerk`/`admin` can only be done by an existing admin via the Utilisateurs screen — there's no invite flow yet.
