#!/usr/bin/env node
// Wait for the v1.8 deployment (commit d6a375c) to go live on Railway,
// then verify the demo-data purge ran on the production database:
//   - /api/health         → ok
//   - /api/content        → 0 items (demo content with 404 URLs gone)
//   - /api/keywords       → live GSC keywords preserved, demo = 0
//   - /api/integrations   → real connection statuses
//   - /api/data-status    → keyword counts live/demo
// Usage: RAILWAY_TOKEN=... node scripts/railway-verify-v18.mjs
import { readFileSync } from 'node:fs'

const TOKEN = process.env.RAILWAY_TOKEN
if (!TOKEN) throw new Error('RAILWAY_TOKEN env var required')
const STATE = JSON.parse(readFileSync('/home/z/my-project/scripts/railway-state.json', 'utf8'))
const { environmentId, serviceId } = STATE
const APP = 'https://organic-growth-os-production.up.railway.app'
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[verify]', new Date().toISOString().slice(11, 19), ...a)

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

async function latestDeployment() {
  const data = await gql(
    `query($envId: String!) { environment(id: $envId) { deployments { edges { node { id status createdAt serviceId } } } } }`,
    { envId: environmentId },
  )
  return data.environment.deployments.edges
    .map((e) => e.node)
    .filter((n) => n.serviceId === serviceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || null
}

async function waitForDeploy(skipId = null, timeoutMs = 10 * 60_000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    const dep = await latestDeployment().catch(() => null)
    if (dep && dep.id !== last) { last = dep.id; log(`deployment ${dep.id} → ${dep.status}`) }
    if (dep && dep.id !== skipId && (dep.status === 'SUCCESS' || dep.status === 'SUCCEEDED')) return dep
    if (dep && dep.id !== skipId && (dep.status === 'FAILED' || dep.status === 'CRASHED')) throw new Error(`Deployment ${dep.id} ${dep.status}`)
    await new Promise((r) => setTimeout(r, 15_000))
  }
  throw new Error('Timed out waiting for deployment')
}

async function getJson(path) {
  const res = await fetch(APP + path, { signal: AbortSignal.timeout(60_000) })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// ---- main ----
if (process.env.TRIGGER === '1') {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git -C /home/z/my-project rev-parse HEAD').toString().trim()
  log(`triggering deployment for commit ${sha.slice(0, 8)}…`)
  const data = await gql(
    `mutation($serviceId: String!, $environmentId: String!, $commitSha: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
    }`,
    { serviceId, environmentId, commitSha: sha },
  )
  log('deploy triggered:', JSON.stringify(data))
}

log('waiting for the v1.8 deployment on Railway…')
const before = await latestDeployment().catch(() => null)
const skipId = process.env.TRIGGER === '1' && before ? before.id : null
if (skipId) log(`ignoring previous deployment ${skipId.slice(0, 8)} — waiting for the new one`)
const dep = await waitForDeploy(skipId)
log(`deployment ${dep.id} is live (${dep.status})`)

// first request triggers ensureSeeded → the one-time purge runs now;
// give it a moment then poll health until ok
let health = null
for (let i = 0; i < 12; i++) {
  health = await getJson('/api/health').catch(() => null)
  if (health?.json?.status === 'ok') break
  log(`health not ready yet (${health?.status ?? 'network'}) — retrying`)
  await new Promise((r) => setTimeout(r, 10_000))
}
log('health:', JSON.stringify(health?.json))

const content = await getJson('/api/content?brand=holy_strips')
log(`content: status=${content.status} items=${content.json?.summary?.total} clicks=${content.json?.summary?.totalOrganicClicks}`)

const keywords = await getJson('/api/keywords?brand=holy_strips')
log(`keywords: status=${keywords.status} total=${keywords.json?.summary?.total} live=${keywords.json?.summary?.live} demo=${keywords.json?.summary?.demo}`)

const integrations = await getJson('/api/integrations')
const intg = (integrations.json?.integrations || []).map((i) => `${i.order}. ${i.name} = ${i.status}`)
log(`integrations: status=${integrations.status} connected=${integrations.json?.summary?.connected}/${integrations.json?.summary?.total}`)
for (const line of intg) log('   ' + line)

const ds = await getJson('/api/data-status')
log(`data-status: porter=${ds.json?.porter?.connected} gsc=${ds.json?.porter?.gscAccounts} keywords live/demo=${ds.json?.keywords?.live}/${ds.json?.keywords?.demo} anyReal=${ds.json?.flags?.anyReal}`)

const ok =
  health?.json?.status === 'ok' &&
  content.json?.summary?.total === 0 &&
  keywords.json?.summary?.demo === 0 &&
  keywords.json?.summary?.live > 0

log(ok ? '✅ v1.8 VERIFIED on production — demo data purged, real data intact' : '⚠️ CHECK RESULTS ABOVE — some verification failed')
if (!ok) process.exit(1)
