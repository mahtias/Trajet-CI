# Trajet CI

Application de billetterie multi-compagnies pour les bus interurbains en Côte d'Ivoire (20 compagnies : UTB, UTRAKO, UTNA, UTD, UTS, UTY, UTM, UTBG, UTG, UTF, UTT, UTDK, UTSS, SAMA Transport, STM, SOTRACO, Trans Bouaké, Trans Korhogo, West Trans CI, San-Pédro Express).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/utb-ticketing run dev` — run the frontend (port 24273)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — Secret for express-session

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS + shadcn/ui + Wouter + TanStack Query
- API: Express 5 + Zod validation
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Charts: Recharts (admin dashboard)
- QR: qrcode library (server-side PNG generation)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — database schema (companies, routes, trips, seats, tickets, users)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/utb-ticketing/src/` — React frontend

## Architecture decisions

- Three user roles: `passenger`, `clerk`, `admin` — role stored in session
- OTP auth: phone number → 6-digit OTP (returned as `devOtp` in response for MVP; replace with SMS in production)
- Seat reservations expire after 10 minutes (auto-released on next seat fetch)
- Orange Money payment simulated (MVP): call `/api/payments/initiate` then `/api/payments/callback` with `status: "success"`
- QR codes are base64 PNG data URLs generated server-side with `qrcode`
- No Supabase/Firebase — uses Replit's built-in PostgreSQL

## Product

### Module Passager
- Recherche de trajets par départ/arrivée/date
- Sélection de siège (grille 40 places : vert=libre, rouge=vendu, orange=réservé)
- Réservation temporaire 10 minutes
- Paiement simulé Orange Money
- Génération de ticket QR code
- Historique des tickets

### Module Guichetier (Clerk)
- Vue des trajets du jour
- Plan des sièges en temps réel
- Vente manuelle (paiement cash)
- Validation QR à l'embarquement

### Module Admin
- CRUD compagnies, routes, trajets
- Gestion des prix
- Tableau de bord ventes (graphiques Recharts)
- Rapports export CSV

## Test accounts (dev)

- Admin: `+2250700000001` → OTP in devOtp field
- Clerk: `+2250700000002` → OTP in devOtp field
- Passenger: `+2250700000003` → OTP in devOtp field

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-server run build` before restarting the API workflow
- `zod/v4` is not available in the api-server bundle — use `import { z } from "zod"` (plain zod)
- Date format query params use plain `z.string().regex(...)` instead of `zod.date()` (Orval generates `zod.date()` which rejects query strings)
- After schema changes: `pnpm --filter @workspace/db run push`, then rebuild and restart API

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
