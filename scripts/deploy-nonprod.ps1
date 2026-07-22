[CmdletBinding()]
param(
  [ValidateSet('Validate', 'Apply')]
  [string]$Mode = 'Validate',

  [string]$ExpectedSubscriptionId = 'fcfde7e1-0df9-405c-99a5-a64979187661',

  [ValidateSet('apex-nonprod')]
  [string]$ResourceGroupName = 'apex-nonprod',

  [ValidateSet('eastus2')]
  [string]$Location = 'eastus2'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$protectedResourceGroups = @('rg-alphaos-prod', 'apex-prod')
$templateFile = Join-Path $PSScriptRoot '..\infra\main.bicep'
$keyVaultName = 'kv-apex-np-fcfde'
$passwordSecretName = 'postgres-admin-password'
$postgresServerName = 'pg-apex-np-fcfde'

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

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & az @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $output
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

if ($protectedResourceGroups -contains $ResourceGroupName) {
  throw "Protected resource group '$ResourceGroupName' can never be targeted by this script."
}

if ($ResourceGroupName -ne 'apex-nonprod') {
  throw 'Only the isolated apex-nonprod resource group is allowed.'
}

$account = Invoke-AzCli account show --output json | ConvertFrom-Json
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Wrong Azure subscription. Expected $ExpectedSubscriptionId; active subscription is $($account.id)."
}

Invoke-AzCli bicep build --file $templateFile --stdout | Out-Null

$postgresPassword = $env:APEX_NONPROD_POSTGRES_PASSWORD
try {
  $groupExists = (Invoke-AzCli group exists --name $ResourceGroupName --output tsv).Trim() -eq 'true'
  $vaultExists = $false
  $postgresExists = $false

  if ($groupExists) {
    $vaultId = Invoke-AzCliOptional keyvault show `
      --resource-group $ResourceGroupName `
      --name $keyVaultName `
      --query id `
      --output tsv
    $vaultExists = -not [string]::IsNullOrWhiteSpace($vaultId)

    $postgresId = Invoke-AzCliOptional postgres flexible-server show `
      --resource-group $ResourceGroupName `
      --name $postgresServerName `
      --query id `
      --output tsv
    $postgresExists = -not [string]::IsNullOrWhiteSpace($postgresId)
  }

  if ([string]::IsNullOrWhiteSpace($postgresPassword) -and $vaultExists) {
    $postgresPassword = Invoke-AzCliOptional keyvault secret show `
      --vault-name $keyVaultName `
      --name $passwordSecretName `
      --query value `
      --output tsv
  }

  if ([string]::IsNullOrWhiteSpace($postgresPassword) -and $postgresExists) {
    throw @"
The non-production PostgreSQL server already exists, but this caller cannot read its
password from Key Vault. Refusing to generate a replacement because that would rotate the
database credential. Use the environment-scoped OIDC deployer with Key Vault Secrets User,
or set APEX_NONPROD_POSTGRES_PASSWORD explicitly for this process.
"@
  }

  if ([string]::IsNullOrWhiteSpace($postgresPassword)) {
    # First deployment only. Hex is strong, URL-safe, and never printed or written to disk.
    $postgresPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  }

  $parameters = @(
    "expectedSubscriptionId=$ExpectedSubscriptionId"
    "resourceGroupName=$ResourceGroupName"
    "location=$Location"
    "postgresAdministratorPassword=$postgresPassword"
  )

  if ($Mode -eq 'Validate') {
    Write-Host "Running subscription what-if for isolated target '$ResourceGroupName'..."
    Invoke-AzCli deployment sub what-if `
      --name 'apex-nonprod-foundation-whatif' `
      --location $Location `
      --template-file $templateFile `
      --parameters @parameters `
      --no-pretty-print
  }
  else {
    $deploymentName = "apex-nonprod-foundation-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Write-Host "Applying isolated non-production foundation to '$ResourceGroupName'..."
    Invoke-AzCli deployment sub create `
      --name $deploymentName `
      --location $Location `
      --template-file $templateFile `
      --parameters @parameters `
      --query '{state:properties.provisioningState,outputs:properties.outputs}' `
      --output json
  }
}
finally {
  $postgresPassword = $null
}
