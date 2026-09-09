#!/usr/bin/env node
// Railway fix pass 2:
// 1) re-set ALL variables as SERVICE-scoped (shared vars were not injected at runtime)
// 2) apply startCommand + healthcheck directly on the service instance (Railpack ignores railway.json)
// 3) redeploy latest commit
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const TOKEN = process.env.RAILWAY_TOKEN
const STATE = JSON.parse(readFileSync('/home/z/my-project/scripts/railway-state.json', 'utf8'))
const { projectId, environmentId, serviceId } = STATE
const SECRETS_FILE = '/home/z/my-project/.vault-secrets.txt'
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[fix]', ...a)

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => ({}))
  if (json.errors) throw new Error('GraphQL error: ' + JSON.stringify(json.errors))
  return json.data
}

// ---- 1. service-scoped variables ----
const secrets = {}
for (const line of readFileSync(SECRETS_FILE, 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) secrets[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
const envVars = {
  ...secrets,
  DATABASE_URL: 'file:/data/custom.db',
  ENCRYPTION_KEY: randomBytes(32).toString('hex'),
}
for (const [name, value] of Object.entries(envVars)) {
  await gql(
    `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    { input: { projectId, environmentId, serviceId, name, value, skipDeploys: true } },
  )
  log('service var set:', name)
}

// ---- 2. service instance config ----
await gql(
  `mutation($s: String!, $e: String!, $i: ServiceInstanceUpdateInput!) {
    serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: $i)
  }`,
  {
    s: serviceId,
    e: environmentId,
    i: {
      startCommand: 'npx next start -p ${PORT:-3000}',
      healthcheckPath: '/api/health',
      healthcheckTimeout: 180,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
  },
)
log('service instance updated: startCommand + healthcheck')

// ---- 3. redeploy latest commit ----
const { execSync } = await import('node:child_process')
const sha = execSync('git rev-parse HEAD').toString().trim()
log('deploying commit', sha)
const dep = await gql(
  `mutation($s: String!, $e: String!, $c: String) { serviceInstanceDeployV2(serviceId: $s, environmentId: $e, commitSha: $c) }`,
  { s: serviceId, e: environmentId, c: sha },
)
log('deployment triggered:', dep.serviceInstanceDeployV2)
writeFileSync(
  '/home/z/my-project/scripts/railway-state.json',
  JSON.stringify({ ...STATE, fixDeploymentId: dep.serviceInstanceDeployV2 }, null, 2),
)
