# Apex ACS calling

## Current boundary

The Apex application, Key Vault and deployment boundary are isolated to
resource group `apex-nonprod`:

- Apex-owned Communication Services resource: `acs-apex-np-fcfde`
- Container App: `ca-apex-dev`
- Key Vault: `kv-apex-np-fcfde`
- Secret reference: `acs-connection-string`

For the pre-cutover dev rehearsal, Apex uses the already-provisioned Alpha dev
ACS account `rg-alphah-dev/acs-alphah-dev` and its toll-free caller ID
`+18337939961`. The credential is copied server-side into the Apex nonprod
Key Vault; it is not a repository value, image layer, deployment parameter, or
browser credential. Neither Alpha application is changed, and Alpha production
is not referenced by this calling path.

Routine app deployments treat `acs-connection-string` as an existing secret
and preserve the current `ACS_CALLER_ID`. Replacing either calling identity is
an explicit calling-bootstrap action, not an incidental image deployment.

## Implemented

- A signed-in coach, front-desk/operations lead, or owner must hold
  `call:patient`. Medical and executive profiles do not receive it.
- Authorization is re-checked against the patient care team and clinic scope.
- Apex creates a durable contact-history row before any number is dialed.
- The browser uses the real Azure Communication Services Calling SDK.
- Staff receive live dialing/ringing/connected state plus mute and hang-up.
- Connected, completed, failed, duration, and ACS result transitions are
  committed with hash-chained audit witnesses.
- No audio is recorded.

## Current PSTN configuration

`ACS_CALLER_ID` is `+18337939961` in Apex nonprod and belongs to the shared
Alpha dev ACS account described above. Apex continues to fail closed if the
caller ID is missing, malformed, or does not belong to the configured ACS
account.

Before a dedicated Apex production calling account replaces this pre-cutover
configuration, the remaining choice is operational:

- A geographic/local number is appropriate for clinic voice calling.
- A toll-free number supports the planned voice plus SMS path, but SMS still
  requires the separate verification, consent, STOP/DNC, webhook, and
  deliverability work.

After provisioning, run an authenticated real-device call from an imported
patient chart, verify both parties' audio, mute and hang-up, then confirm the
single contact row and all ledger transitions.

Inbound call routing, voicemail, recording/transcription, and SMS are separate
workflows and are not represented as complete by the outbound call UI.
