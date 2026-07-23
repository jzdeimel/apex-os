# Apex OS cutover runbook

Last updated: 2026-07-22. This runbook is for the V1 (`alpha-health-platform-prod`)
to V2 (`apex-os`) transition. It deliberately separates preparation from the
production traffic decision.

## Safety boundary

- `rg-alphaos-prod` is the V1 production boundary. No Apex preparation command
  targets it for deployment, schema change, role assignment, or secret update.
- `apex-prod` remains the V2 production boundary and is not used for rehearsal.
- `apex-nonprod` is the isolated rehearsal boundary. Its Postgres server,
  Container Apps environment, registry, Key Vault, network, identity, and app
  are all separate resources.
- The GitHub deploy identity is scoped only to `apex-nonprod`. Its federated
  subject is the GitHub `nonprod` environment; it has no role assignment on
  either production resource group.
- A V1 database used by the importer is opened in a `REPEATABLE READ READ ONLY`
  transaction. The runner refuses to continue when source and target resolve to
  the same database.

## What is ready

- Isolated non-production Azure foundation and authenticated `ca-apex-dev`.
  Its deployment setup registers the exact EasyAuth callback and enables Entra
  ID-token issuance required by the confidential web login flow.
- Nonprod explicitly runs with `APEX_DEMO_MODE=false`; a rehearsal cannot use
  seeded identity fallback or legacy server-side demo token handling.
- GitHub OIDC deployment without a stored Azure client secret.
- Green infrastructure CI, including build, audit, API smoke, and UI smoke.
- V1-skin accessibility gate: zero contrast failures across 51 routed screens,
  including the unauthenticated booking and secure-intake entry surfaces.
- Credential-based NCV resolver and the three ordered encounter segments.
- Nurse lab-draw queue, NCV coverage view, vitals, H&P signing, and append-only
  clinical facts.
- Versioned intake definition and UI for allergies, missing organs, surgeries,
  major disease, cancer, and family cancer history.
- Explicit typed signature, read attestation, E-SIGN consent, exact document
  hashing, immutable retained signed records, artifact/delivery receipts.
- Patient magic-link primitives: 256-bit token, hash-only persistence, 15-minute
  single-use link, a server-enforced 15-minute idle timeout and 12-hour absolute
  HttpOnly session, staff-only pilot issuance, and an explicit
  staff-to-synthetic-patient dual-identity table.
- Public booking/intake routes are narrowly excluded from staff EasyAuth. The
  private intake credential is placed in a browser-only URL fragment, removed
  from the address bar before resolution, and sent to the public resolver in a
  header so it does not enter the request path or infrastructure access logs.
- A separate read-only `/patient` pilot is protected by that patient session and
  reads demographics, care team, appointments, messages, and signed-document
  metadata only from the authenticated Apex client id. The seeded `/portal/*`
  demonstration remains staff-only.
- V1 baseline/delta importer with deterministic IDs, provenance, watermarks,
  run records, checksums and reconciliation. It recognizes the actual Alpha
  production legacy schema, validates its exact column fingerprint, imports
  clients/staff, translates note-shaped Alpha `Appointment` and `ProgressNote`
  rows into Apex consult history, and creates zero Apex calendar appointments
  from those rows. It also imports client-linked historical purchases as an
  immutable sales-and-lines ledger with exact signed-cent reconciliation; it
  preserves returns and zero-value activity without asserting that a new Apex
  invoice or card charge occurred. Ambiguous rows and source inconsistencies
  are retained in a private exception queue.
- Alpha `ClientTouch` rows import as immutable external contact history, not as
  claims of Apex secure-portal delivery. Client linkage is exact; an unresolved
  historical staff participant remains null. Attachment manifests stay in the
  private exception queue until the files are downloaded, scanned and re-housed
  in protected Apex storage.
- A separately published migration image and dormant manual Container Apps job
  inside `apex-nonprod`. The deployed template hardcodes
  `MIGRATION_AUTHORIZED=false`; source and target URLs are Key Vault references.
- Working-hours/calendar-busy persistence and fail-closed free-window logic.
- Three-way fulfillment routing, per-clinic merchant requirement, payment
  idempotency guard, and a dunning policy.

## Cutover blockers that code cannot invent

The cutover is **NO-GO** while any required row below is unresolved.

| Owner input | Required evidence |
| --- | --- |
| Staff working hours | Effective-dated hours per staff/location, including part-time days |
| Clinical credentials | RN vs LPN for the three generic “Nurse” rows; license number, state, expiry, supervising physician, and DEA where applicable |
| NCV policy | Continuity vs availability; Myrtle Beach female routing; telehealth NCV; Raleigh DC model |
| Google calendars | Calendar IDs, account consent, busy-read permission, and an owner-approved sync direction |
| Clover | Four sandbox and production merchant IDs, per-merchant API credentials, tested declines/refunds, and a written card-vault migration or re-collection plan |
| ACS SMS | Sending number, A2P 10DLC registration, delivery-report webhook, and migrated DNC/STOP suppression state |
| ACS Email | Verified domain, SPF/DKIM/DMARC, approved quota, warmup plan, and bounce/complaint handling |
| GHL/MindBody | Complete exports, API access, vault decision, suppression list, memberships/packages/contracts/appointments, and final-delta procedure |
| Patient pilot | Named 10-patient cohort, valid emails, staff-as-patient mappings, support owner, and acceptance script |
| Portal expansion | Every patient feature enabled beyond the `/patient` pilot must be bound to the authenticated V2 client; no `lib/mock/*` fallback |

The database-only `/patient` pilot may be exercised by a named cohort after a
successful migration rehearsal. `/portal/*` must remain behind staff EasyAuth
until the last blocker above is closed. Enabling the seeded demonstration portal
for patients could show demo records to a real patient.

## Rehearsal sequence

Run all commands from a controlled job inside the `apex-nonprod` network. Put
database URLs in job secrets; never type them into the command line or CI log.
The job expects Key Vault secret `v1-readonly-database-url`, issued to a V1 role
that has CONNECT and SELECT only. Its default command is the rehearsal dry run;
deploying the job does not start it.

1. Deploy the readiness image to `ca-apex-dev`. Confirm `/api/health` reports
   database configured and migrations applied. The deployment automation
   restarts the new revision after the EasyAuth update so patient exclusions are
   loaded before health verification.
2. Dry-run a full extract. This requires only the V1 read-only URL and emits
   counts/checksums, never names, email addresses, or raw source IDs. The report
   also reports the detected source shape/fingerprint, exception totals, and
   every unmapped clinical, commercial, operations, reference, and MedSource
   table so continuity scope cannot be approved from guesswork:

   ```powershell
   npm run migrate:v1 -- --mode=rehearsal
   ```

3. Apply to the empty/recreated non-production target. Three independent
   controls are required so an accidental invocation stays a dry run:

   ```powershell
   $env:MIGRATION_AUTHORIZED = "true"
   $env:MIGRATION_TARGET_LABEL = "apex-nonprod-rehearsal"
   npm run migrate:v1 -- --apply --mode=rehearsal --initiated-by=<operator-id> --confirm-target=apex-nonprod-rehearsal
   ```

4. Reconcile independently:

   ```powershell
   npm run migrate:v1 -- --reconcile-only --mode=rehearsal
   ```

   `ok` must be true, and missing, mismatched, and extra must all be zero.
5. Have Matt execute the NCV, intake, signature, escalation, payment-decline,
   calendar-conflict, and patient-login acceptance scripts against nonprod.
6. Restore/recreate the rehearsal target and repeat. One successful run is a
   demonstration; two runs with the same checksum prove repeatability.

## Baseline and final delta

The first controlled production-target load is `baseline`. Record the returned
`nextWatermark` in the change record. Every later `delta` must use the prior
successful watermark exactly:

```powershell
npm run migrate:v1 -- --apply --mode=baseline --initiated-by=<operator-id> --confirm-target=<approved-target-label>
npm run migrate:v1 -- --apply --mode=delta --watermark=<prior-nextWatermark> --initiated-by=<operator-id> --confirm-target=<approved-target-label>
```

Staff, canonical source-derived locations, historical contacts and the purchase
ledger are fully rescanned on every run because legacy Alpha `User`,
`ClientTouch` and `Purchase` have no `updatedAt`; immutable checksums expose any
changed communication or commercial fact.
Clients, consult-note rows, progress notes and their migration exceptions use the bounded interval
`updatedAt > priorWatermark AND updatedAt <= nextWatermark`, so concurrent Alpha
writes are picked up by the next delta rather than missed.

## Go/no-go at T-60 minutes

- CI is green on the exact image digest being promoted.
- Database backup/PITR is verified for both systems.
- Baseline plus final delta reconcile with zero missing/mismatch/extra.
- No enabled clinic or patient route reads seeded patients, staff, appointments,
  payments, messages, labs, prescriptions, or consents.
- All pilot users pass sign-in and can see only their own record.
- Every clinic has correct hours, credentials, coverage, and merchant mapping.
- ACS send/STOP/delivery and email bounce flows pass in production accounts.
- Clover $1 authorization/void, decline, charge, and partial refund reconcile to
  the correct clinic accounts.
- Website forms/widgets have a timed owner and tested rollback.
- Help desk, front desk, clinical lead, payment owner, and incident commander
  are present in the cutover bridge.

If any item is not evidenced, remain on V1. A calendar invite or verbal “looks
good” is not evidence.

## Traffic switch and rollback

1. Put V1 scheduling/intake writes into the agreed freeze window.
2. Run the final V1 delta and reconciliation.
3. Take a V2 backup/restore point and record the promoted image digest.
4. Switch website/API traffic to V2 in one reversible routing change.
5. Run the smoke script and one synthetic transaction per clinic.
6. Observe health, error rate, database saturation, auth failures, queue depth,
   and payment/messaging delivery continuously for the first hour.

Rollback is a traffic decision, not a database delete. Route traffic back to V1
and preserve V2 unchanged for investigation. Do **not** delete imported rows or
run a reverse migration during an incident. If V2 accepted real writes, those
writes must be reconciled/replayed before V1 is reopened for unrestricted
editing; otherwise rollback silently loses care, scheduling, consent, or money
events. Until a tested V2-to-V1 replay exists, use a short write freeze and a
manual incident ledger rather than pretending rollback is lossless.
