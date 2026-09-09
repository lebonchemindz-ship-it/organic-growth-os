#!/usr/bin/env node
// ============================================================
// SET A NEW SETTINGS PIN on Railway production
// Why: the Railway GraphQL API never returns variable VALUES
// (write-only), the local .pin-remember.txt / .vault-secrets.txt
// were wiped by the sandbox reset, and the old PIN was never
// committed to git. The documented way to recover access is to
// set a new SETTINGS_PIN (the dashboard hint says exactly this:
// "Change it any time via the SETTINGS_PIN env var").
//
// What it does:
//   1. generate a random 6-digit PIN (or use argv[2])
//   2. upsert SETTINGS_PIN shared-scope   (skipDeploys: true)
//   3. upsert SETTINGS_PIN service-scope  (skipDeploys: false →
//      Railway auto-redeploys the service so the new value is
//      injected into the running container)
//   4. save the PIN to /home/z/my-project/.pin-remember.txt
//      (gitignored on purpose — local reminder only)
//
// Usage: RAILWAY_TOKEN=... node scripts/set-new-pin.mjs [6-digit-pin]
// ============================================================
import { writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'

const TOKEN = process.env.RAILWAY_TOKEN
if (!TOKEN) throw new Error('RAILWAY_TOKEN env var required')

const projectId = '5e1577a1-ab90-436e-8153-a6a7ada3bed0'
const environmentId = 'ba3684b0-8c14-493e-bdeb-2ed78803353c'
const serviceId = '69b78146-0111-47d2-874f-ee183c6d1235'
const PIN = process.argv[2] || String(randomInt(100000, 1000000))
const REMINDER = '/home/z/my-project/.pin-remember.txt'
const ENDPOINT = 'https://backboard.railway.app/graphql/v2'
const log = (...a) => console.log('[set-pin]', new Date().toISOString().slice(11, 19), ...a)

if (!/^\d{6}$/.test(PIN)) throw new Error('PIN must be exactly 6 digits (got: ' + PIN + ')')

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

// 1) shared scope (backup consistency — no deploy trigger)
await gql(
  `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
  { input: { projectId, environmentId, name: 'SETTINGS_PIN', value: PIN, skipDeploys: true } },
)
log('SETTINGS_PIN updated (shared scope, no deploy)')

// 2) service scope — the effective one; auto-redeploy so it goes live
await gql(
  `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
  { input: { projectId, environmentId, serviceId, name: 'SETTINGS_PIN', value: PIN, skipDeploys: false } },
)
log('SETTINGS_PIN updated (service scope) — Railway will redeploy the service')

// 3) local reminder (gitignored)
writeFileSync(REMINDER, `SETTINGS_PIN (Railway production) = ${PIN}\nSet at ${new Date().toISOString()}\n`)
log('PIN saved to .pin-remember.txt (gitignored, local only)')

console.log('NEW_PIN=' + PIN)
