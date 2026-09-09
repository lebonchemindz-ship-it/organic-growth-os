#!/usr/bin/env node
// Wait for the SETTINGS_PIN redeploy to go live, then verify the new
// PIN against the production /api/keys/verify endpoint.
// Usage: RAILWAY_TOKEN=... NEW_PIN=858270 node scripts/wait-pin-live.mjs
const TOKEN = process.env.RAILWAY_TOKEN
const PIN = process.env.NEW_PIN
if (!TOKEN || !PIN) throw new Error('RAILWAY_TOKEN and NEW_PIN env vars required')

const environmentId = 'ba3684b0-8c14-493e-bdeb-2ed78803353c'
const serviceId = '69b78146-0111-47d2-874f-ee183c6d1235'
const APP = 'https://organic-growth-os-production.up.railway.app'
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[pin-live]', new Date().toISOString().slice(11, 19), ...a)

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

const before = await latestDeployment()
log(`previous deployment: ${before.id.slice(0, 8)} (${before.status}) — waiting for the PIN redeploy`)

const started = Date.now()
let dep = null
while (Date.now() - started < 10 * 60_000) {
  dep = await latestDeployment().catch(() => null)
  if (dep && dep.id !== before.id) {
    log(`deployment ${dep.id.slice(0, 8)} → ${dep.status}`)
    if (dep.status === 'SUCCESS' || dep.status === 'SUCCEEDED') break
    if (dep.status === 'FAILED' || dep.status === 'CRASHED') throw new Error(`Deployment ${dep.id} ${dep.status}`)
  }
  await new Promise((r) => setTimeout(r, 15_000))
}
if (!dep || dep.id === before.id) throw new Error('No new deployment appeared in 10 minutes')
log(`deployment ${dep.id.slice(0, 8)} is live`)

// wait for the app to answer health
let health = null
for (let i = 0; i < 12; i++) {
  try {
    const res = await fetch(APP + '/api/health', { signal: AbortSignal.timeout(30_000) })
    health = await res.json().catch(() => ({}))
    if (health?.status === 'ok') break
  } catch {}
  log('health not ready yet — retrying')
  await new Promise((r) => setTimeout(r, 10_000))
}
log('health:', JSON.stringify(health))

// verify the new PIN (200 = accepted, 401 = invalid)
const res = await fetch(APP + '/api/keys/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-settings-pin': PIN },
  body: '{}',
  signal: AbortSignal.timeout(30_000),
})
const body = await res.json().catch(() => ({}))
log(`verify: HTTP ${res.status} → ${JSON.stringify(body)}`)
if (res.status !== 200) {
  console.error('PIN NOT ACCEPTED — check the deployment env')
  process.exit(1)
}
log('✅ new PIN is live and accepted on production')
