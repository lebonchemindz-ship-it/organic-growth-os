#!/usr/bin/env node
// Railway setup for Organic Growth OS
// 1) set shared env vars (migrated credentials from Vercel + DATABASE_URL + new ENCRYPTION_KEY)
// 2) githubRepoDeploy -> creates the repo-bound service + first deployment
// 3) attach persistent volume at /data (SQLite lives there)
// 4) save state for the poll script
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const TOKEN = process.env.RAILWAY_TOKEN
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID
const ENV_ID = process.env.RAILWAY_ENV_ID
const REPO = 'lebonchemindz-ship-it/organic-growth-os'
const BRANCH = 'main'
const SECRETS_FILE = '/home/z/my-project/.vault-secrets.txt'
const STATE_FILE = '/home/z/my-project/scripts/railway-state.json'

if (!TOKEN || !PROJECT_ID || !ENV_ID) {
  console.error('Missing RAILWAY_TOKEN / RAILWAY_PROJECT_ID / RAILWAY_ENV_ID')
  process.exit(1)
}

const ENDPOINT = 'https://backboard.railway.app/graphql/v2'

async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => ({}))
  if (json.errors) {
    const msg = JSON.stringify(json.errors)
    throw new Error(`GraphQL error: ${msg}`)
  }
  return json.data
}

const log = (...a) => console.log('[setup]', ...a)

// ---- 0. load migrated credentials ----
const secrets = {}
for (const line of readFileSync(SECRETS_FILE, 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) secrets[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
log('migrated credential keys:', Object.keys(secrets).join(', '))

const envVars = {
  ...secrets,
  DATABASE_URL: 'file:/data/custom.db',
  ENCRYPTION_KEY: randomBytes(32).toString('hex'),
}

// ---- 1. set shared variables (before any service exists) ----
for (const [name, value] of Object.entries(envVars)) {
  await gql(
    `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    { input: { projectId: PROJECT_ID, environmentId: ENV_ID, name, value, skipDeploys: true } },
  )
  log('variable set:', name)
}

// ---- 2. deploy from GitHub repo (creates the repo-bound service + deployment) ----
let deployRef = null
try {
  const data = await gql(
    `mutation($input: GitHubRepoDeployInput!) { githubRepoDeploy(input: $input) }`,
    { input: { projectId: PROJECT_ID, repo: REPO, branch: BRANCH, environmentId: ENV_ID } },
  )
  deployRef = data.githubRepoDeploy
  log('githubRepoDeploy returned:', JSON.stringify(deployRef))
} catch (e) {
  log('githubRepoDeploy failed (continuing to volume anyway):', e.message)
}

// ---- 3. discover the service (must be exactly one in this project) ----
const proj = await gql(
  `query($id: String!) { project(id: $id) { services { edges { node { id name } } } } }`,
  { id: PROJECT_ID },
)
const services = proj.project.services.edges.map((e) => e.node)
log('services in project:', JSON.stringify(services))
if (services.length === 0) throw new Error('No service was created — aborting')
if (services.length > 1) log('WARNING: more than one service — picking the first; verify manually!')
const serviceId = services[0].id
log('serviceId:', serviceId)

// ---- 4. attach persistent volume at /data ----
let volumeId = null
try {
  const vol = await gql(
    `mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id name } }`,
    { input: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId, mountPath: '/data' } },
  )
  volumeId = vol.volumeCreate.id
  log('volume created:', volumeId)
} catch (e) {
  log('volumeCreate failed:', e.message)
}

// ---- 5. save state ----
writeFileSync(
  STATE_FILE,
  JSON.stringify({ projectId: PROJECT_ID, environmentId: ENV_ID, serviceId, volumeId, deployRef }, null, 2),
)
log('state saved to', STATE_FILE)
