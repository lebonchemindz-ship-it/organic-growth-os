#!/usr/bin/env node
// Poll the Railway deployment until healthy, add the public domain, verify the app.
// Usage: RAILWAY_TOKEN=... node scripts/railway-poll.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const TOKEN = process.env.RAILWAY_TOKEN
const STATE = JSON.parse(readFileSync('/home/z/my-project/scripts/railway-state.json', 'utf8'))
const { projectId, environmentId, serviceId } = STATE
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[poll]', new Date().toISOString().slice(11, 19), ...a)

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
    `query($envId: String!) { environment(id: $envId) { deployments { edges { node { id status createdAt serviceId url staticUrl } } } } }`,
    { envId: environmentId },
  )
  const nodes = data.environment.deployments.edges
    .map((e) => e.node)
    .filter((n) => n.serviceId === serviceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return nodes[0] || null
}

async function triggerDeploy() {
  const data = await gql(
    `mutation($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }`,
    { serviceId, environmentId },
  )
  log('serviceInstanceDeployV2 triggered:', JSON.stringify(data))
}

async function ensureDomain() {
  // check for an existing service domain first (idempotent)
  try {
    const existing = await gql(
      `query($envId: String!) { environment(id: $envId) { serviceInstances { edges { node { domains { serviceDomains { domain targetPort } } } } } } }`,
      { envId: environmentId },
    )
    const doms = (existing.environment.serviceInstances.edges || []).flatMap(
      (e) => e.node.domains.serviceDomains || [],
    )
    if (doms.length) {
      log('existing service domain found:', JSON.stringify(doms[0]))
      return doms[0]
    }
  } catch (e) {
    log('domain lookup failed:', e.message.slice(0, 150))
  }
  try {
    const data = await gql(
      `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain suffix targetPort } }`,
      { input: { serviceId, environmentId, targetPort: 3000 } },
    )
    const d = data.serviceDomainCreate
    log('service domain created:', JSON.stringify(d))
    return d
  } catch (e) {
    // probably already exists — try to read it back from the service
    log('serviceDomainCreate failed (may already exist):', e.message.slice(0, 200))
    try {
      const data = await gql(
        `query($id: String!) { service(id: $id) { project { environments { edges { node { id } } } } } }`,
        { id: serviceId },
      )
    } catch {}
    return null
  }
}

async function httpJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const text = await res.text()
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    return { status: res.status, text: text.slice(0, 200) }
  }
}

// ---------- main ----------
const TERMINAL_OK = ['SUCCESS', 'SLEEPING']
const TERMINAL_BAD = ['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED']
const TIMEOUT_MS = 18 * 60 * 1000
const started = Date.now()
let retries = 0

let dep = null
while (Date.now() - started < TIMEOUT_MS) {
  dep = await latestDeployment()
  if (!dep) {
    log('no deployment found yet...')
  } else {
    log(`deployment ${dep.id.slice(0, 8)} status=${dep.status}`)
    if (TERMINAL_OK.includes(dep.status)) break
    if (TERMINAL_BAD.includes(dep.status)) {
      if (retries < 2) {
        retries++
        log(`deployment ${dep.status} — triggering a fresh deploy (retry #${retries})`)
        await triggerDeploy()
        await new Promise((r) => setTimeout(r, 15000))
        continue
      }
      break
    }
  }
  await new Promise((r) => setTimeout(r, 10000))
}

if (!dep || !TERMINAL_OK.includes(dep.status)) {
  console.error('[poll] DEPLOYMENT DID NOT BECOME HEALTHY — last status:', dep && dep.status)
  process.exit(2)
}
log('deployment is healthy:', dep.id)

// ---------- domain ----------
const dom = await ensureDomain()
let publicUrl = null
if (dom) {
  publicUrl = dom.domain ? `https://${dom.domain}` : null
  if (!publicUrl && dom.suffix) publicUrl = `https://organic-growth-os${dom.suffix}.up.railway.app`
}

if (!publicUrl && (dep.staticUrl || dep.url)) {
  publicUrl = dep.staticUrl || dep.url
}

if (!publicUrl) {
  console.error('[poll] no public URL resolved')
  process.exit(3)
}

// give the edge a moment to route
await new Promise((r) => setTimeout(r, 8000))
log('public URL:', publicUrl)

// ---------- verify ----------
let health = null
for (let i = 0; i < 6; i++) {
  try {
    health = await httpJson(`${publicUrl}/api/health`)
    if (health.status === 200) break
  } catch (e) {
    log('health attempt failed:', e.message)
  }
  await new Promise((r) => setTimeout(r, 10000))
}
log('health:', JSON.stringify(health))

let dataStatus = null
try {
  dataStatus = await httpJson(`${publicUrl}/api/data-status`)
} catch (e) {
  dataStatus = { error: e.message }
}
log('data-status:', JSON.stringify(dataStatus).slice(0, 800))

writeFileSync(
  '/home/z/my-project/scripts/railway-state.json',
  JSON.stringify({ ...STATE, publicUrl, deploymentId: dep.id, health, dataStatus }, null, 2),
)

const ok = health && health.status === 200
console.log(ok ? '[poll] VERIFY_OK' : '[poll] VERIFY_FAILED')
process.exit(ok ? 0 : 4)
