[CmdletBinding()]
param(
  [string]$ExpectedSubscriptionId = 'fcfde7e1-0df9-405c-99a5-a64979187661',
  [string]$GitHubRepository = 'jzdeimel/apex-os',
  [ValidateSet('nonprod')]
  [string]$GitHubEnvironment = 'nonprod'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resourceGroupName = 'apex-nonprod'
$displayName = 'apex-os-nonprod-deployer'
$federatedCredentialName = 'github-apex-os-nonprod'

function Invoke-AzCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $output = & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed: az $($Arguments -join ' ')"
  }
  return $output
}

function ConvertFrom-AzJson {
  param([string[]]$Lines)

  return ConvertFrom-Json -InputObject ($Lines -join "`n")
}

function Ensure-RoleAssignment {
  param(
    [string]$PrincipalId,
    [string]$Role,
    [string]$Scope
  )

  $existing = Invoke-AzCli role assignment list `
    --assignee-object-id $PrincipalId `
    --role $Role `
    --scope $Scope `
    --query '[0].id' `
    --output tsv

  if ([string]::IsNullOrWhiteSpace($existing)) {
    Invoke-AzCli role assignment create `
      --assignee-object-id $PrincipalId `
      --assignee-principal-type ServicePrincipal `
      --role $Role `
      --scope $Scope `
      --query id `
      --output tsv | Out-Null
  }
}

$account = ConvertFrom-AzJson (Invoke-AzCli account show --output json)
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Wrong Azure subscription. Expected $ExpectedSubscriptionId; active subscription is $($account.id)."
}

$groupExists = (Invoke-AzCli group exists --name $resourceGroupName --output tsv).Trim() -eq 'true'
if (-not $groupExists) {
  throw "Resource group '$resourceGroupName' must exist before bootstrapping its scoped deployer."
}

$parsedApps = ConvertFrom-AzJson (
  Invoke-AzCli ad app list --filter "displayName eq '$displayName'" --output json
)
$apps = @(@($parsedApps) | Where-Object {
  $null -ne $_ -and $_.PSObject.Properties.Name -contains 'appId'
})

if ($apps.Count -gt 1) {
  throw "Multiple Entra applications named '$displayName' exist; refusing to guess."
}

if ($apps.Count -eq 0) {
  $app = ConvertFrom-AzJson (
    Invoke-AzCli ad app create --display-name $displayName --sign-in-audience AzureADMyOrg --output json
  )
}
else {
  $app = $apps[0]
}

$parsedServicePrincipals = ConvertFrom-AzJson (
  Invoke-AzCli ad sp list --filter "appId eq '$($app.appId)'" --output json
)
$servicePrincipals = @(@($parsedServicePrincipals) | Where-Object {
  $null -ne $_ -and $_.PSObject.Properties.Name -contains 'appId'
})
if ($servicePrincipals.Count -gt 1) {
  throw "Multiple service principals exist for application $($app.appId); refusing to guess."
}
if ($servicePrincipals.Count -eq 0) {
  $servicePrincipal = ConvertFrom-AzJson (
    Invoke-AzCli ad sp create --id $app.appId --output json
  )
}
else {
  $servicePrincipal = $servicePrincipals[0]
}

$subject = "repo:$GitHubRepository`:environment:$GitHubEnvironment"
$parsedCredentials = ConvertFrom-AzJson (
  Invoke-AzCli ad app federated-credential list --id $app.id --output json
)
$credentials = @(@($parsedCredentials) | Where-Object {
  $null -ne $_ -and $_.PSObject.Properties.Name -contains 'name'
})
$matchingCredential = $credentials | Where-Object { $_.name -eq $federatedCredentialName }

if (-not $matchingCredential) {
  $credential = @{
    name = $federatedCredentialName
    issuer = 'https://token.actions.githubusercontent.com'
    subject = $subject
    description = 'GitHub Actions OIDC for the Apex non-production environment only.'
    audiences = @('api://AzureADTokenExchange')
  } | ConvertTo-Json -Compress

  # Azure CLI on Windows strips JSON quoting when an object is passed directly.
  # A short-lived file is the supported cross-shell form; it contains identifiers
  # only (no client secret) and is removed even when Azure rejects the request.
  $credentialFile = Join-Path ([IO.Path]::GetTempPath()) (
    "apex-nonprod-federated-$([guid]::NewGuid().ToString('N')).json"
  )
  try {
    [IO.File]::WriteAllText(
      $credentialFile,
      $credential,
      (New-Object Text.UTF8Encoding($false))
    )
    Invoke-AzCli ad app federated-credential create `
      --id $app.id `
      --parameters $credentialFile `
      --query id `
      --output tsv | Out-Null
  }
  finally {
    Remove-Item -LiteralPath $credentialFile -Force -ErrorAction SilentlyContinue
  }
}
elseif ($matchingCredential.subject -ne $subject) {
  throw "Existing federated credential has unexpected subject '$($matchingCredential.subject)'."
}

$resourceGroupScope = "/subscriptions/$ExpectedSubscriptionId/resourceGroups/$resourceGroupName"
$keyVaultScope = "$resourceGroupScope/providers/Microsoft.KeyVault/vaults/kv-apex-np-fcfde"
$containerRegistryScope = "$resourceGroupScope/providers/Microsoft.ContainerRegistry/registries/acrapexnpfcfde"

# These permissions stop at the non-production resource-group boundary.
Ensure-RoleAssignment -PrincipalId $servicePrincipal.id -Role 'Contributor' -Scope $resourceGroupScope
Ensure-RoleAssignment -PrincipalId $servicePrincipal.id -Role 'Role Based Access Control Administrator' -Scope $resourceGroupScope
Ensure-RoleAssignment -PrincipalId $servicePrincipal.id -Role 'Key Vault Secrets User' -Scope $keyVaultScope
Ensure-RoleAssignment -PrincipalId $servicePrincipal.id -Role 'AcrPush' -Scope $containerRegistryScope

[ordered]@{
  AZURE_CLIENT_ID = $app.appId
  AZURE_TENANT_ID = $account.tenantId
  AZURE_SUBSCRIPTION_ID = $ExpectedSubscriptionId
  GITHUB_OIDC_SUBJECT = $subject
  AZURE_SCOPE = $resourceGroupScope
} | ConvertTo-Json
