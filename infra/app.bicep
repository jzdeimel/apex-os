targetScope = 'resourceGroup'

@description('The only resource group this application template may target.')
@allowed([
  'apex-nonprod'
])
param expectedResourceGroupName string = 'apex-nonprod'

@description('Immutable image in the dedicated non-production registry.')
param image string

@description('Client ID of the separate Entra application used by Container Apps EasyAuth.')
param entraClientId string

@secure()
param entraClientSecret string = ''

param tenantId string = '1e7ed424-6240-48b5-a836-9db1c38eb00b'
param location string = 'eastus2'
@description('Purchased ACS caller-ID number in E.164. Empty until number provisioning is approved.')
param acsCallerId string = ''
@description('Explicit one-time nonprod bootstrap from the existing Alpha dev ACS account. Routine releases keep this false.')
param bootstrapAlphaDevCalling bool = false

var appName = 'ca-apex-dev'
var environmentName = 'cae-apex-nonprod'
var registryName = 'acrapexnpfcfde'
var keyVaultName = 'kv-apex-np-fcfde'
var communicationServiceName = 'acs-apex-np-fcfde'
var communicationConnectionSecretName = 'acs-connection-string'
var webAuthClientSecretName = 'web-auth-client-secret'
// Azure cloud suffixes include their leading dot (for example
// `.vault.azure.net`), so concatenate rather than inserting another separator.
var webAuthClientSecretUrl = 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${webAuthClientSecretName}'
var runtimeIdentityName = 'id-apex-nonprod-runtime'
var tags = {
  application: 'apex-os'
  environment: 'nonprod'
  managedBy: 'bicep'
  repository: 'jzdeimel/apex-os'
  dataClassification: 'restricted-phi-nonprod'
  productionImpact: 'none'
  expectedResourceGroup: expectedResourceGroupName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: keyVault
  name: 'database-url'
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-03-31' = {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

resource alphaDevCommunicationService 'Microsoft.Communication/communicationServices@2023-03-31' existing = {
  scope: resourceGroup('rg-alphah-dev')
  name: 'acs-alphah-dev'
}

// Calling credentials are bootstrapped into the nonprod vault separately from
// routine application releases. Treat the secret as existing so an image
// deployment cannot silently replace a working PSTN account or rotate Apex
// back to a Communication Services resource that owns no phone number.
resource communicationConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: keyVault
  name: communicationConnectionSecretName
}

// The opt-in bootstrap resolves the Alpha dev key entirely inside Azure
// Resource Manager and writes it directly to the Apex nonprod vault. The
// credential never becomes a deployment parameter or output.
resource communicationConnectionSecretBootstrap 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (bootstrapAlphaDevCalling) {
  parent: keyVault
  name: communicationConnectionSecretName
  properties: {
    value: alphaDevCommunicationService.listKeys().primaryConnectionString
    attributes: {
      enabled: true
    }
  }
}

var communicationConnectionSecretUrl = bootstrapAlphaDevCalling
  ? communicationConnectionSecretBootstrap!.properties.secretUri
  : communicationConnectionSecret.properties.secretUri

// Secret creation/rotation is a bootstrap-only operation. Routine app
// deployments use the existing versionless Key Vault reference and therefore
// do not need permission to read or rewrite the Entra credential.
resource webAuthClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(entraClientSecret)) {
  parent: keyVault
  name: webAuthClientSecretName
  properties: {
    value: entraClientSecret
    attributes: {
      enabled: true
    }
  }
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: runtimeIdentityName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 2
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: runtimeIdentity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: databaseUrlSecret.properties.secretUriWithVersion
          identity: runtimeIdentity.id
        }
        {
          name: 'aad-client-secret'
          keyVaultUrl: webAuthClientSecretUrl
          identity: runtimeIdentity.id
        }
        {
          name: 'acs-connection-string'
          keyVaultUrl: communicationConnectionSecretUrl
          identity: runtimeIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'apex-web'
          image: image
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'APEX_DEMO_MODE'
              // Rehearsal must exercise the same fail-closed identity and
              // bearer-token rules as cutover. Demo behavior is never enabled
              // in the shared Azure environment.
              value: 'false'
            }
            {
              name: 'APEX_ENVIRONMENT'
              value: 'nonprod'
            }
            {
              // Nonprod is the product-review environment: show the surfaces
              // the owner built instead of silently applying the cutover's
              // smaller V1-parity preset.
              name: 'APEX_FEATURE_PRESET'
              value: 'full'
            }
            {
              // Theme and feature availability are separate decisions. Keep
              // the shared review environment on Alpha's dark treatment.
              name: 'APEX_UI_SKIN'
              value: 'alpha-dark'
            }
            {
              name: 'ACS_CONNECTION_STRING'
              secretRef: 'acs-connection-string'
            }
            {
              name: 'ACS_CALLER_ID'
              value: acsCallerId
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

resource auth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: app
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [
        '/api/health'
        '/book'
        '/intake'
        '/api/public/leads'
        '/api/public/intake'
        '/api/public/locations'
        '/patient-sign-in'
        '/patient'
        '/patient/*'
        '/api/patient-auth/exchange'
        '/api/patient-auth/logout'
        '/api/patient/messages'
        '/api/patient/community'
        '/api/patient/community/*'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        isAutoProvisioned: false
        registration: {
          clientId: entraClientId
          clientSecretSettingName: 'aad-client-secret'
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            entraClientId
          ]
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
      cookieExpiration: {
        convention: 'FixedTime'
        timeToExpiration: '08:00:00'
      }
    }
    httpSettings: {
      requireHttps: true
      routes: {
        apiPrefix: '/.auth'
      }
    }
  }
}

output appName string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
output image string = image
output communicationServiceName string = communicationService.name
