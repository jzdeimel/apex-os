# Non-production GitHub OIDC deployer

The infrastructure workflow uses a secretless Entra workload identity. It is intentionally
separate from the Apex runtime identity and has no role at subscription scope or in either
production resource group.

The bootstrap script creates or reuses `apex-os-nonprod-deployer` and binds exactly this
GitHub subject:

```text
repo:jzdeimel/apex-os:environment:nonprod
```

It then grants:

| Role | Scope | Reason |
| --- | --- | --- |
| Contributor | `apex-nonprod` resource group | Manage non-production resources |
| Role Based Access Control Administrator | `apex-nonprod` resource group | Reconcile Bicep role assignments inside non-production only |
| Key Vault Secrets User | `kv-apex-np-fcfde` | Reuse the existing database password during idempotent deployments |
| AcrPush | `acrapexnpfcfde` | Publish non-production images |

`Role Based Access Control Administrator` is privileged even at resource-group scope. The
script must not be run until that persistent access grant is explicitly approved. It cannot
grant access in `rg-alphaos-prod` or `apex-prod` because its assignment stops at the
`apex-nonprod` resource-group boundary.

After approval, run:

```powershell
.\scripts\bootstrap-nonprod-deployer.ps1
```

Add its three non-secret IDs as GitHub environment variables on the `nonprod` environment:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

The workflow at `.github/workflows/infra-nonprod.yml` is manual and hardcodes the
`apex-nonprod` target. Its `Apply` path runs the isolation validator after deployment.
