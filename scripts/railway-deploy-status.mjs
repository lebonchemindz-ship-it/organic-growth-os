#!/usr/bin/env node
// Quick check of the latest Railway deployment status for our service.
// Usage: RAILWAY_TOKEN=... node scripts/railway-deploy-status.mjs
import { readFileSync } from 'node:fs'

const TOKEN = process.env.RAILWAY_TOKEN
if (!TOKEN) throw new Error('RAILWAY_TOKEN env var required')
const STATE = JSON.parse(readFileSync('/home/z/my-project/scripts/railway-state.json', 'utf8'))
const { environmentId, serviceId } = STATE
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `query($envId: String!) { environment(id: $envId) { deployments { edges { node { id status createdAt serviceId meta } } } } }`,
    variables: { envId: environmentId },
  }),
})
const json = await res.json()
const nodes = (json.data?.environment?.deployments?.edges || [])
  .map((e) => e.node)
  .filter((n) => n.serviceId === serviceId)
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  .slice(0, 3)
for (const n of nodes) {
  console.log(n.id, '|', n.status, '|', n.createdAt, '|', JSON.stringify(n.meta ?? {}).slice(0, 140))
}
