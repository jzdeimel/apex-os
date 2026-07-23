# Apex ACS calling

## Current boundary

Calling infrastructure is isolated to resource group `apex-nonprod`:

- Communication Services resource: `acs-apex-np-fcfde`
- Container App: `ca-apex-dev`
- Key Vault: `kv-apex-np-fcfde`
- Secret reference: `acs-connection-string`

The connection string is resolved by Azure during the Bicep deployment and
written directly to Key Vault. It is not a repository value, image layer,
deployment parameter, CLI output, or browser credential. Alpha production is
not referenced by this calling path.

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

## Required before a real PSTN call

`ACS_CALLER_ID` is intentionally empty. A public ACS phone number must be
selected and purchased, then passed to `infra/app.bicep` as an E.164 value.
Apex will continue to refuse dialing until that value exists.

The remaining choice is operational:

- A geographic/local number is appropriate for clinic voice calling.
- A toll-free number supports the planned voice plus SMS path, but SMS still
  requires the separate verification, consent, STOP/DNC, webhook, and
  deliverability work.

After provisioning, run an authenticated real-device call from an imported
patient chart, verify both parties' audio, mute and hang-up, then confirm the
single contact row and all ledger transitions.

Inbound call routing, voicemail, recording/transcription, and SMS are separate
workflows and are not represented as complete by the outbound call UI.
