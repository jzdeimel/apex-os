[CmdletBinding()]
param(
  [ValidateSet('Validate', 'Apply')]
  [string]$Mode = 'Validate',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^acrapexnpfcfde\.azurecr\.io/apex-os:[A-Za-z0-9._-]+$')]
  [string]$Image,

  [string]$WebClientId,

  [string]$ExpectedSubscriptionId = 'fcfde7e1-0df9-405c-99a5-a64979187661'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resourceGroupName = 'apex-nonprod'
$appName = 'ca-apex-dev'
$environmentName = 'cae-apex-nonprod'
$keyVaultName = 'kv-apex-np-fcfde'
$clientSecretName = 'web-auth-client-secret'
$displayName = 'apex-os-nonprod-web'
$templateFile = Join-Path $PSScriptRoot '..\infra\app.bicep'

function Invoke-AzCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $output = & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed during '$($Arguments[0]) $($Arguments[1])'. Secure arguments were redacted."
  }
  return $output
}

function Invoke-AzCliOptional {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & az @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $output
  }
  finally { $ErrorActionPreference = $previous }
}

function ConvertFrom-AzJson {
  param([string[]]$Lines)
  return ConvertFrom-Json -InputObject ($Lines -join "`n")
}

$account = ConvertFrom-AzJson (Invoke-AzCli account show --output json)
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Wrong subscription. Expected $ExpectedSubscriptionId; active subscription is $($account.id)."
}

$groupExists = (Invoke-AzCli group exists --name $resourceGroupName --output tsv).Trim() -eq 'true'
if (-not $groupExists) { throw "Required resource group '$resourceGroupName' does not exist." }

Invoke-AzCli acr repository show-tags `
  --name 'acrapexnpfcfde' `
  --repository 'apex-os' `
  --query "[?@=='$($Image.Split(':')[-1])'] | [0]" `
  --output tsv | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_)) { throw "Image '$Image' does not exist in the non-production registry." }
  }

$environmentDomain = (Invoke-AzCli containerapp env show `
  --resource-group $resourceGroupName `
  --name $environmentName `
  --query properties.defaultDomain `
  --output tsv).Trim()
$redirectUri = "https://$appName.$environmentDomain/.auth/login/aad/callback"

$createdOrResolvedApp = $null
if ([string]::IsNullOrWhiteSpace($WebClientId)) {
  $parsedApps = ConvertFrom-AzJson (
    Invoke-AzCli ad app list --filter "displayName eq '$displayName'" --output json
  )
  $apps = @(@($parsedApps) | Where-Object {
    $null -ne $_ -and $_.PSObject.Properties.Name -contains 'appId'
  })
  if ($apps.Count -gt 1) { throw "Multiple Entra applications named '$displayName' exist." }

  if ($apps.Count -eq 0) {
    if ($Mode -ne 'Apply') {
      throw "Entra app '$displayName' does not exist. First run must use -Mode Apply."
    }
    $createdOrResolvedApp = ConvertFrom-AzJson (
      Invoke-AzCli ad app create `
        --display-name $displayName `
        --sign-in-audience AzureADMyOrg `
        --web-redirect-uris $redirectUri `
        --output json
    )
  }
  else {
    $createdOrResolvedApp = $apps[0]
    if ($Mode -eq 'Apply') {
      Invoke-AzCli ad app update --id $createdOrResolvedApp.id --web-redirect-uris $redirectUri | Out-Null
    }
    else {
      $parsedRedirects = ConvertFrom-AzJson (
        Invoke-AzCli ad app show --id $createdOrResolvedApp.id --query web.redirectUris --output json
      )
      $redirects = @($parsedRedirects)
      if ($redirectUri -notin $redirects) {
        throw "Entra app redirect URI is not configured. Apply mode is required to add '$redirectUri'."
      }
    }
  }
  $WebClientId = $createdOrResolvedApp.appId

  # Assign before filtering. In Windows PowerShell 5.1, wrapping this function
  # call directly inside @(@(...)) can preserve the returned JSON array as one
  # nested value; the property filter then sees the array rather than its
  # service-principal element and incorrectly reports zero matches.
  $parsedServicePrincipals = ConvertFrom-AzJson (
    Invoke-AzCli ad sp list --filter "appId eq '$WebClientId'" --output json
  )
  $servicePrincipals = @(@($parsedServicePrincipals) | Where-Object {
    $null -ne $_ -and $_.PSObject.Properties.Name -contains 'appId'
  })
  if ($servicePrincipals.Count -eq 0) {
    Invoke-AzCli ad sp create --id $WebClientId --query id --output tsv | Out-Null
  }
}

$clientSecret = $env:APEX_NONPROD_WEB_CLIENT_SECRET
if ([string]::IsNullOrWhiteSpace($clientSecret)) {
  $clientSecret = Invoke-AzCliOptional keyvault secret show `
    --vault-name $keyVaultName `
    --name $clientSecretName `
    --query value `
    --output tsv
}

$existingAppId = Invoke-AzCliOptional containerapp show `
  --resource-group $resourceGroupName `
  --name $appName `
  --query id `
  --output tsv

if ([string]::IsNullOrWhiteSpace($clientSecret)) {
  if (-not [string]::IsNullOrWhiteSpace($existingAppId)) {
    # Routine deployers should not need secret-read permission. Verify the
    # existing Container App points at the expected Key Vault secret by
    # metadata only, then let Bicep retain it through a versionless reference.
    $authSecretRef = (Invoke-AzCli containerapp secret list `
      --resource-group $resourceGroupName `
      --name $appName `
      --query "[?name=='aad-client-secret'].keyVaultUrl | [0]" `
      --output tsv).Trim()
    $expectedSecretPrefix = "https://$keyVaultName.vault.azure.net/secrets/$clientSecretName"
    if (-not $authSecretRef.StartsWith($expectedSecretPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'The existing app does not reference the expected EasyAuth Key Vault secret.'
    }
    $clientSecret = ''
  }
  elseif ($Mode -ne 'Apply' -or $null -eq $createdOrResolvedApp) {
    throw 'The first app deployment requires -Mode Apply under an identity allowed to create Entra credentials.'
  }
  else {
    $clientSecret = (Invoke-AzCli ad app credential reset `
      --id $createdOrResolvedApp.id `
      --append `
      --display-name 'container-app-easyauth' `
      --years 1 `
      --query password `
      --output tsv).Trim()
  }
}

try {
  Invoke-AzCli bicep build --file $templateFile --stdout | Out-Null
  $parameters = @(
    "expectedResourceGroupName=$resourceGroupName"
    "image=$Image"
    "entraClientId=$WebClientId"
    "tenantId=$($account.tenantId)"
  )
  if (-not [string]::IsNullOrWhiteSpace($clientSecret)) {
    $parameters += "entraClientSecret=$clientSecret"
  }

  if ($Mode -eq 'Validate') {
    Invoke-AzCli deployment group what-if `
      --resource-group $resourceGroupName `
      --name 'apex-nonprod-app-whatif' `
      --template-file $templateFile `
      --parameters @parameters `
      --no-pretty-print
  }
  else {
    $result = ConvertFrom-AzJson (
      Invoke-AzCli deployment group create `
        --resource-group $resourceGroupName `
        --name "apex-nonprod-app-$(Get-Date -Format 'yyyyMMddHHmmss')" `
        --template-file $templateFile `
        --parameters @parameters `
        --query '{state:properties.provisioningState,outputs:properties.outputs}' `
        --output json
    )
    $result | ConvertTo-Json -Depth 8

    # Container Apps auth runs in a sidecar. Auth-config changes are persisted
    # immediately but an already-started sidecar can keep the prior excluded
    # paths until its revision restarts. Make that reload part of deployment so
    # patient sign-in cannot remain accidentally trapped behind staff EasyAuth.
    $latestRevision = (Invoke-AzCli containerapp show `
      --resource-group $resourceGroupName `
      --name $appName `
      --query properties.latestRevisionName `
      --output tsv).Trim()
    if ([string]::IsNullOrWhiteSpace($latestRevision)) {
      throw 'Deployment returned no latest Container Apps revision.'
    }
    Invoke-AzCli containerapp revision restart `
      --resource-group $resourceGroupName `
      --name $appName `
      --revision $latestRevision | Out-Null

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
      $revisionState = ConvertFrom-AzJson (Invoke-AzCli containerapp revision show `
        --resource-group $resourceGroupName `
        --name $appName `
        --revision $latestRevision `
        --query '{health:properties.healthState,running:properties.runningState}' `
        --output json)
      if ($revisionState.health -eq 'Healthy' -and $revisionState.running -eq 'Running') {
        $ready = $true
        break
      }
      Start-Sleep -Seconds 5
    }
    if (-not $ready) { throw "Revision '$latestRevision' did not become healthy after auth reload." }
  }
}
finally {
  $clientSecret = $null
}
