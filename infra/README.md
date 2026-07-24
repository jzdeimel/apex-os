# Apex non-production infrastructure

This stack creates an isolated home for Apex development, migration rehearsals and QA.
It cannot target either production resource group: the Bicep template and deployment
script both allow only `apex-nonprod`.

## Boundary

| System | Resource group | This stack may write? |
| --- | --- | --- |
| Alpha OS v1 production | `rg-alphaos-prod` | **No** |
| Apex OS v2 production | `apex-prod` | **No** |
| Apex development / QA | `apex-nonprod` | **Yes** |

The first deployment creates:

- a dedicated Container Apps environment;
- a dedicated ACR with admin credentials disabled;
- a dedicated Key Vault using RBAC, soft delete and purge protection;
- a dedicated VNet;
- a private-network-only PostgreSQL 16 Flexible Server and `apex` database;
- a user-assigned runtime identity scoped only to the non-production registry and vault;
- a Log Analytics workspace.

No Container App is exposed by the foundation deployment. The application is added only
after a separate Entra application, authentication policy and non-production image exist.
This avoids briefly publishing an unauthenticated clinical application during bootstrap.

## Validate first

From the repository root:

```powershell
.\scripts\deploy-nonprod.ps1
```

The default mode runs `az deployment sub what-if`; it does not create or change resources.

Apply only after reviewing that output:

```powershell
.\scripts\deploy-nonprod.ps1 -Mode Apply
.\scripts\validate-nonprod-isolation.ps1
```

The PostgreSQL administrator password is generated in memory on the first deployment,
stored in the non-production Key Vault, and reused from Key Vault on subsequent deployments.
It is never printed or written to the repository.

## Data rule

The environment is tagged `dataClassification=restricted-phi-nonprod`. Normal development
still uses synthetic data, but this isolated environment may hold the explicitly authorized
Alpha migration copy. The source connection is used only inside a read-only transaction;
all application and migration writes target Apex. Alpha production must never be deployed,
altered, or used as the migration target.
