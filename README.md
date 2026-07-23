# Apex — the Alpha Health Clinic Operating System

Apex is a single operating system for running **Alpha Health**, a clinician-led
hormone / TRT / peptide / medical-weight-loss and diagnostics group with four
locations (Raleigh, Raleigh Boutique, Southern Pines, Myrtle Beach) plus
Telehealth. One application serves five distinct audiences — the member, the
coach, the prescribing provider, the front desk, and the owner — each behind the
same authenticated, audited spine.

It is being built to a production standard: **would we trust this with a real
patient, a real employee, real medication, and real money?** Where the answer is
yet "not proven," this README says so plainly. Nothing here claims to be
integrated, persisted, signed, or sent unless it genuinely is.

> **Data & safety.** Demo fixtures contain no real PHI — every fixture patient
> is synthetic and deterministically generated. The isolated Apex nonproduction environment is
> also approved to hold a protected, one-way Alpha migration copy for
> pre-cutover validation. `/admin/migration-preview` is the staff-only,
> audit-witnessed view of that copy and never substitutes demo data. Alpha
> remains read-only throughout. Apex does not prescribe or fulfil; clinical
> suggestions are rule-based, category-level, and always require a licensed
> provider's sign-off (never a dose). Apex is the **system of record** — it has
> **zero** MindBody and **zero** GoHighLevel integration by design.

The complete business-coverage boundary is tracked in
[`docs/ALPHA_END_TO_END_CAPABILITY_MAP.md`](docs/ALPHA_END_TO_END_CAPABILITY_MAP.md);
cutover-critical gaps are tracked separately in
[`docs/ALPHA_OPERATING_GAPS.md`](docs/ALPHA_OPERATING_GAPS.md).

---

## What is actually real vs. what is still seeded

Apex is deliberately honest about its own maturity. The **write paths that
matter are real** — authenticated, authorized, persisted to Postgres, and
audit-chained. Most **reads are still served from a deterministic seed** while
the system of record fills in behind them. This table is the source of truth.

| Capability | State | Where |
| --- | --- | --- |
| Staff identity & **clinical authority** | **Real** — DB is the authority | `staff` table; `mapToStaff` reads it DB-first. `UPDATE staff SET active=false` revokes a prescriber with no deploy. |
| Audit ledger (tamper-evident) | **Real** — hash-chained, durable | `appendLedgerRow` — advisory-locked, transactional, verifiable chain in Postgres |
| Consult co-sign | **Real** — gated durable write | `POST /api/consults/sign` (`sign:encounter`, Medical-only) |
| Task completion | **Real** — gated durable write | `POST /api/tasks/complete` (`write:task`) |
| Order placement and fulfillment | **Real** — atomic order/lines/events/audit/outbox write plus scoped worklist | `POST /api/orders/create`, `GET/PATCH /api/orders` |
| Member self-log (dose / skip / retract / weight / check-in) | **Real** — durable, append-only | `POST /api/member/log` → `dose_log`, `member_day` |
| In-app voice/video/SMS to patients | **Real tokens** | `POST /api/acs/token` — Azure Communication Services VoIP identity |
| Patient-to-coach messaging | **Real** — session-scoped, durable | `/patient`, `GET/POST /api/patient/messages`; coach is the only patient-facing thread |
| Patient community moderation | **Real for the `/patient` pilot** — text-only, owned, audited | Coach-owned groups, pseudonymous membership, reports, patient blocks, SLA queue, retention deadlines and care-team routing in Postgres |
| Public lead capture and acquisition attribution | **Real core** — durable first-touch rows | `/book` and `/api/public/leads` persist the lead, intake invite, source and UTM source/medium/campaign; Executive Pipeline and Acquisition read the same Postgres records |
| CRM ownership and follow-up | **Real core** — durable queue | `/exec/marketing` owns assignment history, a 15-minute first-response clock, first contact, append-only notes, follow-up tasks and loss/reopen reasons |
| Support, service recovery and records requests | **Real workflow core** — durable and audited | `/support`, `/admin/cases`, and `/patient/records` share accountable cases, deadlines, identity-verification state, immutable events and closure evidence; actual PHI export remains gated |
| Protected Alpha migration preview | **Real imported data only** — staff-only and audit-witnessed | `/admin/migration-preview` reads only rows carrying `source_system=alpha-v1`; no seeded fallback, source ids, or exception payloads |
| Consult **draft** autosave and signature | **Real** — durable and role-constrained | `GET/PUT/POST /api/consults/draft`; Coach and Medical use separate allowed note types/channels |
| Staff Community showcase, rosters, broad portal, protocols and broad analytics… | **Seeded preview** | `lib/mock/*` deterministic data; preview dates and provenance are labeled in the UI |

The split is intentional. Domain logic is written pure and portable, so moving a
surface from "seeded read" to "Postgres read" is a transport change, not a
rewrite.

---

## The five consoles

Apex chooses your workspace from an entry screen and keeps every surface for one
audience together. **Revenue and money live only on the owner console** — a coach
or a member never sees it.

- **Member portal** (`/portal/*`) — the daily habit surface: protocol & injection
  map, reconstitution/mixing calculator, "where your levels are" PK view, labs
  with plain-language reads, symptom journal with lab correlation, women's-health
  / menopause tracking, recovery readiness, community, secure messaging, costs &
  membership, and a personal **access log** (who viewed my chart).
- **Coach console** (`/coach/*`) — today's ranked queue, roster, consult authoring
  with an AI prep brief, care-gaps, refills/subscriptions, win-back, handoff,
  documents, training.
- **Medical console** (`/clinic/*`) — the prescriber's cockpit: sign queue (durable
  co-sign), controlled-substance dispense gate with lot recall, population risk
  radar (HCT / E2 / overdue labs / credentials across sites), and the verifiable
  audit ledger.
- **Front desk** (`/desk/*`) — per-location day board, room board, and booking. Each
  desk sees only its own location's day.
- **Owner console** (`/exec/*`, `/admin/*`, `/analytics`) — everything across all
  locations, focused on money: MRR & revenue by service line and site, capacity
  & load, lead pipeline, retention/LTV, daily order report, quality/incidents.

Plus the client chart (`/clients/[id]`) with sex-aware tabs (titration for men,
women's-health/HRT for women, sexual health, labs, contact/ACS), a public
front-door (`/book`), and a one-tap **Demo Guide** (`/demo`).

---

## Architecture

```
Browser (React 18 / Next 15 App Router, dark, mobile-first, framer-motion)
   │  EasyAuth (Microsoft Entra, single-tenant) — every request carries a principal
   ▼
Azure Container App  ca-apex  (node:22-alpine, output: standalone)
   │  Server components + Route Handlers
   │    • currentPrincipal()  → decodes x-ms-client-principal
   │    • guard(capability)   → can(actor, capability, subject)  [server-side]
   │    • repo.ts             → the ONLY code that touches the database
   ▼
Azure Postgres Flexible Server  pg-apex-fcfde / db "apex"
   • Drizzle ORM + drizzle-kit migrations (applied in-container at boot)
   • hash-chained audit ledger, staff authority, member log, dispenses
Azure Communication Services  acs-apex   → real VoIP/SMS identity tokens
Azure Container Registry      acrapexfcfde
```

**Stack:** Next.js 15.5 (App Router, standalone output) · React 18.3 · TypeScript ·
Tailwind · framer-motion · recharts · lucide-react · Drizzle ORM + `postgres` ·
Azure Container Apps / Postgres Flexible Server / Communication Services / Entra.
~121k LOC across `app/`, `components/`, `lib/`.

### Why some choices look the way they do

- **Migrations run in the container, not from a laptop** — the production DB
  credential never leaves the Container App secret store, and a replica's schema
  is, by construction, the one shipped in its image.
- **`output: "standalone"`** — `next start` does **not** serve a standalone build.
  Local verification runs `node .next/standalone/server.js` after copying
  `.next/static` and `public/` beside it (the Dockerfile and `scripts/smoke.mjs`
  do the same).
- **Hydration safety is a discipline, not an afterthought.** All date parsing goes
  through `absolute()` (treats a zoneless ISO string as UTC) because the dev
  server shares the browser timezone while Azure runs UTC — a class of bug that
  is invisible locally. Client stores start empty and read `localStorage` in an
  effect, never during render.
- **Page transitions fail open.** Never wrap the App Router `children` slot in
  `AnimatePresence`/`exit`; animations only ever move content *toward* visible.

---

## Security, authorization & clinical safety

Authorization is **server-enforced**, never a hidden button.

- **Identity** comes from the Entra principal (`x-ms-client-principal`), decoded
  server-side in `currentPrincipal()`. Every mutating route checks it **first** —
  a 401 always outranks a 400, so an unauthenticated caller learns nothing about
  the endpoint.
- **Authority lives in the database.** `mapToStaff` resolves the caller to a
  `staff` row DB-first (by Entra object id, then email), falling back to the
  seeded roster only when no database is configured. **Unmapped returns null, not
  a default** — a valid sign-in with no staff row gets no role and no
  capabilities. Granting or revoking a prescriber is a row change, not a deploy.
- **Capabilities** (`lib/authz/capabilities.ts`) are the unit of permission —
  e.g. `sign:encounter`, `write:consult`, `write:prescription`, `write:order`,
  `write:refund`, `order:labs`, `override:contraindication`, `admin:break-glass`,
  `read:financial`, `read:ledger`. `can(actor, capability, subject)` additionally
  enforces **care-team membership** and **location scope** — a Raleigh provider
  cannot open a Myrtle Beach chart without **break-glass**, which is itself an
  audited event.
- **Roles:** `Medical`, `Coach`, `Admin` (personas are the UI workspace; roles are
  the authority).
- **The audit ledger is tamper-evident.** Each row hashes the previous row's hash
  under a Postgres advisory lock inside a transaction, so appends are strictly
  ordered and the chain is verifiable. Retractions are **compensating writes**,
  never deletes — "it was logged and then retracted" is the true record.
- **Clinical safety:** suggestions are rule-based and category-level (never a
  dose); provider sign-off is required; contraindication rules (e.g.
  estrogen + intact uterus ⇒ progesterone) are encoded; controlled substances
  pass a dispense gate with PDMP/lot-recall checks.

---

## Data model (Drizzle, 82 public tables after current migrations)

Core tables in `lib/db/schema.ts`, migrations in `lib/db/migrations/`:

- **`ledger`** — the hash-chained audit trail (actor, action, entity, subject,
  location, before/after, `prevHash`/`hash`).
- **`staff`** — identity + clinical authority, including `entra_object_id`,
  `role`, `location_ids`, `can_approve`, `active`.
- **`dose_log`** / **`member_day`** — member self-logging (append-only doses with
  retraction; one upsert row per member per day for weight & check-in).
- **`consult`** / **`consult_addendum`** — encounter notes (draft→signed, with
  post-sign addenda) — schema ready; server persistence is the next slice.
- **`dispense`** / **`inventory_movement`** — controlled-substance dispensing and
  stock movement.
- **`contact_entry`**, **`escalation`**, **`lead`** / **`lead_stage_event`**,
  **`consent`**, **`invoice_line`**, **`member_prefs`**, and more.

Apply/generate migrations:

```bash
npx drizzle-kit generate    # generate a migration after a schema.ts change
# migrations auto-apply at boot; /api/health reports the migration state honestly
```

---

## API surface

All routes are Node runtime, `force-dynamic`, and fail closed.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | public | boot + migration state (`ok` / `degraded`) |
| GET | `/api/me` | authenticated | resolved principal (role, staffId) |
| POST | `/api/consults/sign` | `sign:encounter` | durable consult co-sign |
| POST | `/api/tasks/complete` | `write:task` | durable task completion |
| POST | `/api/orders/create` | `write:order` | durable order record |
| POST | `/api/member/log` | authenticated | durable dose/skip/retract/day |
| GET | `/api/ledger` | `read:ledger` | durable audit ledger |
| POST | `/api/acs/token` | authenticated | real ACS VoIP/SMS token |
| GET | `/api/audit` | admin-gated | live referential-integrity check |

`/api/audit` runs a real integrity sweep across the seeded universe (dangling
`*Id` refs, duplicate IDs, NaN, implausible dates, ledger-chain continuity) — a
deliberately strict check, because a silent skip is how a broken reference hides
for months.

---

## Local development

```bash
npm install
npm run dev            # http://localhost:3000  (no DB needed; writes 503 honestly)
```

Without `DATABASE_URL`, reads work from the seed and every durable write returns
an honest `503` — nothing fakes success. With a database:

```bash
export DATABASE_URL="postgresql://USER:PASS@HOST:5432/apex?sslmode=require"
npm run dev
```

**Testing personas locally.** Every request needs an Entra principal. Craft the
header EasyAuth would inject:

```bash
PRINCIPAL=$(node -e "console.log(Buffer.from(JSON.stringify({claims:[
  {typ:'email',val:'m.vale@alphahealth.demo'},
  {typ:'oid',val:'oid-vale'},{typ:'name',val:'Marcus Vale'}]})).toString('base64'))")
curl -H "x-ms-client-principal: $PRINCIPAL" http://localhost:3000/api/me
```

---

## Testing & verification

```bash
npm run typecheck      # tsc --noEmit
npm run lint
npm run smoke          # boots standalone server, asserts 11 invariants
npm run smoke:ui       # Playwright render sweep
```

`scripts/smoke.mjs` is the contract that must never regress: `/api/health` shape;
`/api/me`, `/api/audit`, `/api/acs/token` and **every mutation** return 401/403
unauthenticated; a crafted provider principal resolves to `Medical/st-001`; and a
**coach hitting `sign:encounter` is refused with 403** — the core authorization
invariant. `hardload.mjs` (repo root) is an opacity-aware route sweep that
detects blank-but-present content (`getComputedStyle().opacity`, not `innerText`).
Verify at `America/New_York` **and** `Asia/Tokyo` against the standalone server —
never `next start`.

---

## Build & deploy (Azure)

```bash
# 1. Build the image (ACR). --no-logs: Next's ▲ crashes cp1252 log streaming.
az acr build --registry acrapexfcfde \
  --image apex-os:vN-$(git rev-parse --short HEAD) --image apex-os:latest . --no-logs

# 2. Roll the Container App
az containerapp update -n ca-apex -g apex-prod \
  --image acrapexfcfde.azurecr.io/apex-os:vN-$(git rev-parse --short HEAD)

# 3. Wait for the NEW revision to read Running before verifying
#    (deactivating the old one early = platform 404 while it drains)
curl -s https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io/api/health
```

**Azure resources** (RG `apex-prod`, sub `fcfde7e1-…`): Container App `ca-apex`
in env `cae-apex-prod` · Postgres `pg-apex-fcfde` (db `apex`) · ACS `acs-apex` ·
ACR `acrapexfcfde` · Entra single-tenant app registration for EasyAuth. The DB
firewall allows Azure services only; migrations self-apply from inside the
container.

---

## Repository layout

```
app/            68 routes — entry, /portal, /coach, /clinic, /desk, /exec,
                /admin, /clients/[id], /book, /demo, and app/api/* handlers
components/     UI by domain — portal/, coach/, clinic/, exec/, community/,
                consult/, client/, brand/, layout/
lib/
  db/           schema.ts · repo.ts (only DB access) · migrate.ts · client.ts
  auth/         principal.ts · guard.ts · actor.ts · session.ts
  authz/        capabilities.ts (capability → role grants, can())
  clinical/     titration · womensHealth · sexualHealth · dosing · rules
  community/    buddies · milestones · squads · mentors · kudos · photos
  member/       logStore (durable-synced) · viewer
  mock/         27 deterministic seed collections (no PHI)
  trace/        ledger (hash chain) · acs · analytics · exec · …
scripts/        smoke.mjs · smoke-ui.mjs
```

---

## Roadmap (honest next slices)

1. **Consult drafts off localStorage** — server-side autosave keyed by
   principal + client, `write:consult`-gated, with a visible "not saving" state.
   PHI clinical notes must not persist on a shared workstation.
2. **Golden-path segment 1** — lead → intake → consent → consult → sign, persisted
   end-to-end on Postgres with no in-memory authority.
3. **Order-create UI wiring** — the coach order flow calling the gated durable
   endpoint, with an honest durable-confirmation and failure state.
4. **Reads to Postgres** — migrate seeded reads onto the system of record; at that
   point a failed migration should refuse to start (the code notes exactly where).
5. **Patient identity (CIAM)** and **payments** (abstract processor port, never
   storing PANs); rotate the demo DB credential before any real PHI.

Apex is optimized not for the number of features shown, but for how confidently
Alpha Health could depend on a feature during a real clinic day.
