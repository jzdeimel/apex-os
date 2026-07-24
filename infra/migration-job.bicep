targetScope = 'resourceGroup'

@description('The only resource group this migration job may target.')
@allowed([
  'apex-nonprod'
])
param expectedResourceGroupName string = 'apex-nonprod'

@description('Immutable migration image in the dedicated non-production registry.')
param image string

@description('Bind the V1 source only after its approved SELECT-only Key Vault secret exists.')
param sourceSecretAvailable bool = false

param location string = 'eastus2'

var jobName = 'job-apex-v1-rehearsal'
var environmentName = 'cae-apex-nonprod'
var registryName = 'acrapexnpfcfde'
var keyVaultName = 'kv-apex-np-fcfde'
var sourceDatabaseSecretName = 'v1-readonly-database-url'
var targetDatabaseSecretName = 'database-url'
var keyVaultSecretBaseUrl = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets'
var sourceDatabaseSecretUrl = '${keyVaultSecretBaseUrl}/${sourceDatabaseSecretName}'
var targetDatabaseSecretUrl = '${keyVaultSecretBaseUrl}/${targetDatabaseSecretName}'
var runtimeIdentityName = 'id-apex-nonprod-runtime'
var tags = {
  application: 'apex-os'
  environment: 'nonprod'
  managedBy: 'bicep'
  repository: 'jzdeimel/apex-os'
  dataClassification: 'phi-migration-rehearsal'
  productionImpact: 'read-only-source'
  expectedResourceGroup: expectedResourceGroupName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: runtimeIdentityName
}

resource migrationJob 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 3600
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: runtimeIdentity.id
        }
      ]
      secrets: concat(
        sourceSecretAvailable ? [
          {
          name: 'v1-database-url'
          keyVaultUrl: sourceDatabaseSecretUrl
          identity: runtimeIdentity.id
          }
        ] : [],
        [
          {
            name: 'apex-migration-database-url'
            keyVaultUrl: targetDatabaseSecretUrl
            identity: runtimeIdentity.id
          }
        ]
      )
    }
    template: {
      containers: [
        {
          name: 'v1-rehearsal'
          image: image
          command: [
            'node'
          ]
          args: [
            '--experimental-strip-types'
            '--no-warnings'
            '--import'
            './scripts/register-alias.mjs'
            'scripts/migrate-v1.ts'
            '--mode=rehearsal'
          ]
          env: concat(
            sourceSecretAvailable ? [
              {
              name: 'V1_DATABASE_URL'
              secretRef: 'v1-database-url'
              }
            ] : [],
            [
              {
                name: 'APEX_MIGRATION_DATABASE_URL'
                secretRef: 'apex-migration-database-url'
              }
              {
                name: 'MIGRATION_AUTHORIZED'
                value: 'false'
              }
              {
                name: 'MIGRATION_TARGET_LABEL'
                value: 'apex-nonprod-rehearsal'
              }
              {
                name: 'MIGRATION_INITIATED_BY'
                value: 'job-apex-v1-rehearsal'
              }
            ]
          )
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

output jobName string = migrationJob.name
output image string = image
