[CmdletBinding()]
param(
  [ValidateSet('Validate', 'Apply')]
  [string]$Mode = 'Validate',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^acrapexnpfcfde\.azurecr\.io/apex-os-migration:[A-Za-z0-9._-]+$')]
  [string]$Image,

  [switch]$SourceSecretAvailable,

  [string]$ExpectedSubscriptionId = 'fcfde7e1-0df9-405c-99a5-a64979187661'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resourceGroupName = 'apex-nonprod'
$registryName = 'acrapexnpfcfde'
$keyVaultName = 'kv-apex-np-fcfde'
$templateFile = Join-Path $PSScriptRoot '..\infra\migration-job.bicep'

function Invoke-AzCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $output = & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed during '$($Arguments[0]) $($Arguments[1])'. Secure arguments were not logged."
  }
  return $output
}

$account = Invoke-AzCli account show --query '{id:id}' --output json | ConvertFrom-Json
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Wrong subscription. Expected $ExpectedSubscriptionId; active subscription is $($account.id)."
}

$groupExists = (Invoke-AzCli group exists --name $resourceGroupName --output tsv).Trim() -eq 'true'
if (-not $groupExists) { throw "Required resource group '$resourceGroupName' does not exist." }

$registryGroup = (Invoke-AzCli acr show --name $registryName --query resourceGroup --output tsv).Trim()
if ($registryGroup -ne $resourceGroupName) { throw "Registry is outside '$resourceGroupName'." }

$imageTag = $Image.Split(':')[-1]
$publishedTag = (Invoke-AzCli acr repository show-tags `
  --name $registryName `
  --repository 'apex-os-migration' `
  --query "[?@=='$imageTag'] | [0]" `
  --output tsv).Trim()
if ([string]::IsNullOrWhiteSpace($publishedTag)) { throw "Migration image '$Image' is not published." }

# Do not read either database secret. Routine deployers need only RG-scoped
# deployment rights; the versionless Key Vault references may be installed
# before the V1 SELECT-only credential exists. MIGRATION_AUTHORIZED=false and a
# manual trigger keep the dormant job incapable of applying a migration.

Invoke-AzCli bicep build --file $templateFile --stdout | Out-Null
$parameters = @(
  "expectedResourceGroupName=$resourceGroupName"
  "image=$Image"
  "sourceSecretAvailable=$($SourceSecretAvailable.IsPresent.ToString().ToLowerInvariant())"
)

if ($Mode -eq 'Validate') {
  Invoke-AzCli deployment group what-if `
    --resource-group $resourceGroupName `
    --name 'apex-v1-migration-job-whatif' `
    --template-file $templateFile `
    --parameters @parameters `
    --no-pretty-print
}
else {
  Invoke-AzCli deployment group create `
    --resource-group $resourceGroupName `
    --name "apex-v1-migration-job-$(Get-Date -Format 'yyyyMMddHHmmss')" `
    --template-file $templateFile `
    --parameters @parameters `
    --query '{state:properties.provisioningState,outputs:properties.outputs}' `
    --output json
}
