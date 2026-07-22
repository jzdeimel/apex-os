targetScope = 'subscription'

@description('The only subscription this non-production stack may be deployed into.')
@allowed([
  'fcfde7e1-0df9-405c-99a5-a64979187661'
])
param expectedSubscriptionId string = 'fcfde7e1-0df9-405c-99a5-a64979187661'

@description('Hard-coded allowlist: this template cannot target either production resource group.')
@allowed([
  'apex-nonprod'
])
param resourceGroupName string = 'apex-nonprod'

@description('Primary Azure region for the isolated non-production stack.')
@allowed([
  'eastus2'
])
param location string = 'eastus2'

@secure()
@minLength(32)
@description('Generated on first deployment and retained in the non-production Key Vault.')
param postgresAdministratorPassword string

param postgresAdministratorLogin string = 'apexadmin'


var tags = {
  application: 'apex-os'
  environment: 'nonprod'
  managedBy: 'bicep'
  repository: 'jzdeimel/apex-os'
  dataClassification: 'synthetic-only'
  productionImpact: 'none'
  expectedSubscription: expectedSubscriptionId
}

resource nonprodResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module foundation './modules/foundation.bicep' = {
  name: 'apex-nonprod-foundation'
  scope: nonprodResourceGroup
  params: {
    location: location
    tags: tags
    postgresAdministratorLogin: postgresAdministratorLogin
    postgresAdministratorPassword: postgresAdministratorPassword
  }
}

output resourceGroupName string = nonprodResourceGroup.name
output containerAppsEnvironmentName string = foundation.outputs.containerAppsEnvironmentName
output containerRegistryName string = foundation.outputs.containerRegistryName
output keyVaultName string = foundation.outputs.keyVaultName
output postgresServerName string = foundation.outputs.postgresServerName
output runtimeIdentityName string = foundation.outputs.runtimeIdentityName
