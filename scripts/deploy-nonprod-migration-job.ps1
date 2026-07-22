[CmdletBinding()]
param(
  [ValidateSet('Validate', 'Apply')]
  [string]$Mode = 'Validate',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^acrapexnpfcfde\.azurecr\.io/apex-os-migration:[A-Za-z0-9._-]+$')]
  [string]$Image,

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

# Metadata-only checks. Secret values are never read into this process.
foreach ($secretName in @('database-url', 'v1-readonly-database-url')) {
  $secretId = (Invoke-AzCli keyvault secret show `
    --vault-name $keyVaultName `
    --name $secretName `
    --query id `
    --output tsv).Trim()
  if ([string]::IsNullOrWhiteSpace($secretId)) { throw "Required Key Vault secret '$secretName' is absent." }
}

Invoke-AzCli bicep build --file $templateFile --stdout | Out-Null
$parameters = @(
  "expectedResourceGroupName=$resourceGroupName"
  "image=$Image"
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
