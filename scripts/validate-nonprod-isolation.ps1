[CmdletBinding()]
param(
  [string]$ExpectedSubscriptionId = 'fcfde7e1-0df9-405c-99a5-a64979187661'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resourceGroupName = 'apex-nonprod'
$protectedResourceGroups = @('rg-alphaos-prod', 'apex-prod')

$account = az account show --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the active Azure account.' }
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Wrong Azure subscription. Expected $ExpectedSubscriptionId; active subscription is $($account.id)."
}

$exists = (az group exists --name $resourceGroupName --output tsv).Trim() -eq 'true'
if (-not $exists) {
  throw "Resource group '$resourceGroupName' does not exist yet. Run deploy-nonprod.ps1 -Mode Apply first."
}

$resources = az resource list --resource-group $resourceGroupName --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Unable to inventory '$resourceGroupName'." }

foreach ($resource in $resources) {
  if ($protectedResourceGroups -contains $resource.resourceGroup) {
    throw "Isolation violation: resource '$($resource.name)' resolved into protected group '$($resource.resourceGroup)'."
  }
}

$runtimePrincipalId = az identity show `
  --resource-group $resourceGroupName `
  --name 'id-apex-nonprod-runtime' `
  --query principalId `
  --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($runtimePrincipalId)) {
  throw 'Unable to resolve the Apex non-production runtime identity.'
}

$runtimeAssignments = @(az role assignment list `
  --assignee-object-id $runtimePrincipalId `
  --all `
  --output json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect runtime identity role assignments.' }

$requiredRuntimeRoles = @('AcrPull', 'Key Vault Secrets User')
foreach ($requiredRole in $requiredRuntimeRoles) {
  if (-not ($runtimeAssignments | Where-Object { $_.roleDefinitionName -eq $requiredRole })) {
    throw "Isolation violation: runtime identity is missing required role '$requiredRole'."
  }
}

$allowedScopePrefix = "/subscriptions/$ExpectedSubscriptionId/resourcegroups/$resourceGroupName/"
foreach ($assignment in $runtimeAssignments) {
  if (-not $assignment.scope.StartsWith($allowedScopePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Isolation violation: runtime identity has '$($assignment.roleDefinitionName)' outside apex-nonprod: $($assignment.scope)"
  }
}

$postgres = az postgres flexible-server show `
  --resource-group $resourceGroupName `
  --name 'pg-apex-np-fcfde' `
  --query '{publicNetworkAccess:network.publicNetworkAccess,state:state}' `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the non-production Postgres server.' }
if ($postgres.publicNetworkAccess -ne 'Disabled') {
  throw 'Isolation violation: non-production Postgres public network access is not disabled.'
}

$unexpectedName = $resources | Where-Object { $_.name -match 'alpha-coach|alphaos-prod|ahcoach' }
if ($unexpectedName) {
  throw "Isolation violation: an Alpha production-style resource name exists in apex-nonprod."
}

Write-Host "PASS: $($resources.Count) resources are confined to '$resourceGroupName'."
Write-Host 'PASS: Postgres public network access is disabled.'
Write-Host 'PASS: No Alpha production resource names are present.'
Write-Host 'PASS: Runtime identity roles are confined to apex-nonprod.'
