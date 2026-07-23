# CRM and operational case runbook

Status: implemented in Apex source and intended for nonproduction acceptance.
This does not authorize an Apex production cutover or any change to Alpha OS.

## Acquisition ownership

Every lead receives a 15-minute first-response target when it is captured. This
is an initial operating target, not yet an executive-approved contractual SLA.
The captured deadline does not change later.

The acquisition queue supports:

- claim, release and reasoned reassignment to an active Marketing, Operations
  or Owner account;
- immutable ownership history and ledger evidence;
- first-contact time, stages, loss reason and deliberate reopen;
- append-only working notes;
- assigned follow-up tasks with due time and durable completion evidence.

Conversion remains outside the manual pipeline controls. It may occur only in
the transaction that creates or links the Apex client record.

## Support and service recovery

Any staff role may open a Support or Complaint case at `/support`. Operations
and Owner accounts work the shared queue at `/admin/cases`.

Each case has one owner, priority, first-response deadline, resolution deadline,
linked patient/lead/location fields when supplied, append-only events, and
documented closure. The initial targets are:

| Priority | First response | Resolution target |
| --- | ---: | ---: |
| Urgent | 15 minutes | 1 day |
| High | 1 hour | 2 days |
| Normal | 4 hours | 5 days |
| Low | 24 hours | 10 days |

These targets need operational acceptance before production. Vendor delivery
notifications, attachments, escalation paging, macros and a knowledge base are
not implemented and must not be implied by the UI.

## Patient records requests

An authenticated patient may open and track Access, Release or Amendment cases
at `/patient/records`. Authorized staff may enter the same requests on a
patient's behalf. The case records the requested scope, format/recipient where
applicable, identity-verification state, accountable owner, deadline and
immutable timeline.

The application snapshots the federal outer action windows:

- access/release: 30 calendar days;
- amendment: 60 calendar days.

Those clocks are based on HHS guidance and are a conservative workflow alarm,
not legal advice or a complete state-law policy. HHS describes one additional
30-day access extension when the required written notice is supplied within the
initial period, and an additional 30-day amendment extension in some
circumstances. Apex does not automate an extension today; operations must not
silently change a deadline.

Opening or assigning a case never authorizes disclosure. Before fulfillment,
operations must verify identity and recipient/authorization, establish the
designated record set, apply any lawful redaction/denial process, generate and
validate the package, deliver through an approved channel, and record any
required accounting of disclosure. Those export/delivery controls remain a
cutover gap.

Primary policy references:

- [HHS HIPAA Right of Access](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html)
- [HHS correction/amendment guidance](https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/understanding/special/healthit/correction.pdf)
- [HHS notification responsibilities after an accepted amendment](https://www.hhs.gov/hipaa/for-professionals/faq/549/what-are-a-covered-entitys-responsibilities-to-notify-others-in-a-network-if-an-amendment-is-made/index.html)

## Acceptance drill

Before enabling these workflows in production:

1. Capture a website lead and a walk-in. Claim, reassign, contact, note, task,
   lose and reopen one; verify the ledger and SLA calculations.
2. Open support and complaint cases from Coach, Medical and Front Desk roles.
   Confirm they cannot read the operations-wide queue.
3. As Operations, assign, respond, wait on the requester, fulfill/deny with
   evidence, and close each kind.
4. As a patient, open access, release and amendment requests. Confirm another
   patient cannot read them.
5. Confirm a records case cannot be fulfilled without a resolution and that
   the runbook—not the case status alone—governs actual disclosure.
