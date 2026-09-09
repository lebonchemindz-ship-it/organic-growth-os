#!/usr/bin/env node
// ============================================================
// Inject RAILWAY_TOKEN (+ ids) as a service-scoped variable so
// the app's railway-env backup layer can write deployment env
// vars (vault → Railway write-through backup).
// skipDeploys: true — the value lands in the container on the
// next natural deploy (the git-push deploy that follows).
//
// Usage: RAILWAY_TOKEN=<project token> node scripts/inject-railway-token.mjs
// ============================================================
const TOKEN = process.env.RAILWAY_TOKEN
if (!TOKEN) throw new Error('RAILWAY_TOKEN env var required')

const projectId = '5e1577a1-ab90-436e-8153-a6a7ada3bed0'
const environmentId = 'ba3684b0-8c14-493e-bdeb-2ed78803353c'
const serviceId = '69b78146-0111-47d2-874f-ee183c6d1235'
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[inject-token]', new Date().toISOString().slice(11, 19), ...a)

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

// RAILWAY_TOKEN only — Railway auto-injects RAILWAY_PROJECT_ID,
// RAILWAY_ENVIRONMENT_ID and RAILWAY_SERVICE_ID into every service.
await gql(
  `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
  { input: { projectId, environmentId, serviceId, name: 'RAILWAY_TOKEN', value: TOKEN, skipDeploys: true } },
)
log('RAILWAY_TOKEN injected (service scope, skipDeploys)')

console.log('OK')
