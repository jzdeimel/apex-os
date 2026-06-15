# Apex — Alpha Health Clinic Operating System (Demo)

A polished, demo-ready operating system for **Alpha Health** — a hormone, peptide,
medical weight loss, diagnostics, body composition, and wellness clinic group with
locations in **Raleigh, Southern Pines, Myrtle Beach, and Telehealth**.

Apex is a premium, dark-mode, mobile-friendly clinic dashboard that visualizes the
full client lifecycle: CRM → labs → body composition → AI-assisted (provider-approved)
recommendations → inventory/supply-chain → lifecycle automations → an AI coach copilot.

> ⚠️ **Demo only. Not medical advice.** All recommendations are AI-assisted and require
> review and approval by a licensed provider. No real PHI, no real prescribing, no real
> pharmacy fulfillment, no real Mindbody/EHR/lab integrations. Mindbody data is *simulated*.

---

## What Apex does

| Route | Purpose |
| --- | --- |
| `/` | **Dashboard** — KPIs (active clients, new consults, results ready, inventory alerts, overdue follow-ups, projected revenue), today's schedule, "Attention Needed" queue, revenue/service-mix charts, recent activity. Location filter. |
| `/clients` | **Client CRM** — searchable/filterable list (location, status, coach, program) with status pills and risk flags. |
| `/clients/[id]` | **Client 360** — tabs: Overview, Labs, Body Scan, Recommendations, Timeline, Tasks, Notes. |
| `/recommendations` | **Global review queue** — every AI-assisted recommendation, filter by risk/location/provider/status, bulk-approve (provider role), human-approval-required. |
| `/supply-chain` | **Inventory & supply chain** — multi-location stock, low/expiring/reorder/transfer suggestions, vendors, purchase-order mock flow. |
| `/automations` | **Automation center** — 11 lifecycle automations with trigger/audience/channel/run info, toggleable, generic non-medical message previews. |
| `/agent` | **Coach Copilot** — deterministic, mock-data chat with citations to internal records. No external LLM. |
| `/website` | **Website / intake** — public landing preview + a working 3-step intake quiz that creates a mock lead in local state. |
| `/settings` | Locations, staff/coaches/providers, service categories, **recommendation rules editor**, and integration placeholders. |

### The recommendation engine

`lib/recommendationEngine.ts` exposes a deterministic, rule-based function:

```ts
generateRecommendations(client, labs, bodyScan, inventory, rules) => Recommendation[]
```

It recommends **categories and discussion points — never dosing, never automatic
prescribing**. Every recommendation card shows:

1. **Why** it was suggested (rationale)
2. **What triggered it** (goals / labs / symptoms)
3. **Contraindication / risk flags** (each check passed or flagged)
4. **Confidence score**
5. **Required provider-approval status** (`requiresProviderApproval: true`, always)

Candidate options reflect Alpha's publicly listed service categories (BPC-157, GHK-Cu,
NAD+, PT-141, VIP nasal spray, MK-677, Semaglutide, Tirzepatide, Tesofensine, hormone/
thyroid discussions, nutrition coaching, body-scan follow-up, aesthetics consult) and
show live **inventory availability** — but **dosing is never generated** ("protocol
details added by provider").

---

## Mock data disclaimer

All data in this app is **fabricated for demonstration**. It is stored in plain
TypeScript files under [`lib/mock/`](lib/mock):

- `clients.ts` — 24 clients across 4 locations, every status represented
- `labs.ts` — deterministic **Alpha Base Panel** (30+ biomarkers) generated per client
- `bodyscans.ts` — InBody-style body composition + progress history
- `inventory.ts` — 25 SKUs across locations (peptides, meds, hormones, kits, supplies)
- `vendors.ts` — vendors + purchase orders
- `automations.ts` — 11 automations
- `staff.ts` — 12 staff (providers/coaches/front desk/ops)
- `timeline.ts` — 100+ lifecycle events generated from each client's journey
- `notes.ts`, `tasks.ts`, `appointments.ts`, `mindbody.ts` — supporting records

No real patients, no PHI, no real medical advice.

---

## How to run locally

```bash
cd alpha-os
npm install
npm run dev
# open http://localhost:3000
```

Build for production:

```bash
npm run build
npm start
```

**Requirements:** Node 18.18+ (built/tested on Node 24). No environment variables, no
external/paid APIs, no database — everything runs from local mock data.

### Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (Alpha Health brand: black/charcoal/white with **red** accent — #e93d3d / #bf1e2e — dark-mode first)
- **lucide-react** icons, **Recharts** charts
- shadcn/ui-style local component primitives (`components/ui/`)
- Local React Context store (`lib/store.tsx`) for interactive state (role switcher,
  location filter, recommendation approvals, automation/rule toggles, tasks, notes, leads)

### Deploying to Vercel

This is a standard Next.js app — deploy by importing the repo in Vercel, or:

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

The app is fully responsive (mobile drawer nav + adaptive tables/cards) and looks good
on phone and desktop.

---

## Compliance notes

- The app **never says "prescribed automatically."**
- Every recommendation is labeled **"AI-assisted recommendation for provider/coach review"**
  and carries `requiresProviderApproval: true`.
- **No exact dosing** is ever generated — dosing is always "protocol details added by provider."
- A persistent disclaimer appears across the app:
  *"Demo only. Not medical advice. Recommendations require review and approval by a
  licensed provider."*
- The Coach Copilot is **deterministic** (no external LLM) and cites the internal mock
  records it used.
- Role switcher (Provider / Coach / Operations) gates approval actions — only the
  **Provider** role can approve recommendations.

---

## Future integration roadmap

**Phase 1 — MVP (this build)**
- Mock CRM, mock labs, mock recommendations, mock inventory, mock automations, mock AI agent

**Phase 2**
- Mindbody client/appointment sync
- Real lab PDF upload/parser
- LabCorp / Quest / Health Gorilla integration exploration
- Provider approval workflow (persisted)
- Secure user roles & auth
- Audit logs

**Phase 3**
- EHR integration
- Patient portal
- SMS / email messaging
- Payment / subscription tracking
- Vendor / pharmacy ordering workflow
- Multi-location analytics

**Phase 4**
- Clinical rules governance
- Versioned recommendation protocols
- Compliance review
- HIPAA-ready infrastructure
- SOC 2 roadmap

---

*Apex is a demonstration build created to visualize Alpha Health's internal workflows.
It is not a medical device and provides no medical advice.*
