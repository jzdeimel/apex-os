# Apex V2 review push

As of 2026-07-23, this push is for the isolated Apex development environment.
Alpha OS production remains the live system and is not a deployment target.

## Polished enough to show

- The shared Alpha-dark shell and role-specific Coach, Medical, Front Desk,
  Executive and authenticated patient experiences.
- Coach consult documentation: durable autosave, source-traceable AI draft,
  human review, signature and client-profile history.
- Medical visit documentation: authored SOAP fields, Medical-only visit types,
  durable autosave/signature and no direct patient messaging channel.
- Patient-to-coach messaging, including coach-to-Medical escalation while the
  coach remains the patient's steward.
- Owner feature controls and job-specific role boundaries.
- Text-only patient community pilot: coach-owned groups, backup moderator,
  private handles, opt-in enrollment, report/block tools, severity-based SLA,
  immutable moderation evidence, retention deadlines, post hide/remove,
  community suspension and durable care-team escalation.
- The staff Community showcase and personalized `For you` landing page, with
  the moderation operating center visible to authorized staff.

## Polished for staff review, not a production-system claim

- The broad `/portal/*` engagement experience, education, nutrition/training,
  referrals, gamification, win-back and population insights.
- AI recommendations, Ask Apex, background agents and automations.
- Broad analytics and seeded dashboard figures.

Those surfaces remain visible in Apex development through the `full` preset so
reviewers can evaluate their UX. Seeded dates are labeled as preview data.

## Keep disabled

- Community attachment uploads. Policy, file-type/size gates, scan state and
  retention are implemented, but private Blob storage and malware scanning are
  not. Upload remains fail-closed.
- Direct patient-to-Medical messaging.
- Patient self-booking.
- Emergency-card sharing.
- Any workflow dependent on unaccepted Google Calendar, Clover, ACS
  SMS/email, GHL, Mindbody, MedSource, lab-vendor or production migration
  evidence.

## Acceptance evidence

- 262/262 executable requirements pass.
- Production build and schema consistency pass.
- API authentication smoke passes, including every patient/community route.
- Role browser matrix passes for Coach, Medical, Front Desk, Executive and
  patient in the Alpha-dark skin.
- Disposable-Postgres patient acceptance passes end to end: magic-link
  session, community report, member block, coach acknowledgement/resolution
  and medical escalation.
- WCAG contrast sweep: 0 failures across 71 routes; 0 route render failures.
- Static cutover preflight passes, while the separate go-live evidence remains
  intentionally NO-GO until the named external approvals are recorded.
