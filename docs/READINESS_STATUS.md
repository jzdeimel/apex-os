# Apex readiness status

As of 2026-07-22, V1 production has not been changed. The isolated Azure and
GitHub deployment foundation is complete and green. The Apex readiness branch
builds, typechecks, passes its executable requirements, and has a zero-failure
contrast sweep.

## Completed in code

- Nonprod Azure/OIDC/EasyAuth/CI foundation.
- V1 visual skin and accessibility repairs.
- Feature flags and clinic release preset.
- Real staff actor mapping and database-backed write paths.
- NCV credential tiers, resolution, segments, coverage, queue, vitals, and H&P.
- Versioned five-must-know intake with guided provenance.
- Append-only clinical facts and immutable signature/archive evidence.
- Patient magic-link/session data model, staff-only pilot issuing path, and a
  read-only `/patient` pilot that is scoped from the session and reads only the
  authoritative database.
- Authoritative patient/location/staff/appointment schema and controlled V1
  importer with baseline, delta, dry-run, provenance, and reconciliation.
- The dry run inventories counts for every other V1 clinical, commercial,
  operations, reference, and MedSource table without emitting row contents, so
  the remaining history scope can be accepted or expanded from evidence.
- Immutable web and migration images plus a dormant, manual-triggered Container
  Apps migration job in `apex-nonprod`; it defaults to a source-read-only dry run
  and cannot start until a V1 read-only credential is supplied through Key Vault.
- Working-hours/calendar busy model and payment/messaging fail-safe boundaries.
- CI gates for typecheck, requirements, migration consistency, lint, build,
  container build, dependency audit, API/UI smoke, and WCAG contrast.

## Not ready to enable

- The broad demonstration `/portal/*` experience still reads seeded data and
  remains behind staff EasyAuth. It must not replace the database-only patient
  pilot until each enabled feature has an authoritative read model.
- The importer does not yet move the full historical V1 clinical/financial
  graph; V1 history must remain read-only-accessible unless that scope is added.
- Live Google, Clover, ACS SMS/email, MindBody, and GHL credentials/exports are
  not present in the repository and cannot be inferred.
- The employee roster does not contain working hours, license numbers, license
  expiry, state scope, or supervision relationships.
- The four conflicting/unspecified scheduling policies in the runbook require
  an owner decision.

The current state is suitable for an isolated migration rehearsal and staff
acceptance testing. It is not yet a production go-live state.
