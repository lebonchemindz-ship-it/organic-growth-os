// ============================================================
// CREDENTIAL VAULT — service registry
// Single source of truth for every API the Organic Growth OS
// can connect to: which fields it needs, which env vars each
// field maps to, and whether the connection can be tested.
// Shared by the server (validation, env sync) and the
// API Keys dashboard UI. Data only — no server imports.
// ============================================================

export type CredentialGroupId = 'brain' | 'intelligence' | 'infrastructure' | 'outreach' | 'brand'

export interface CredentialField {
  id: string
  label: string
  /** env var(s) this field is synced to (all receive the same value) */
  envVars: string[]
  secret: boolean
  required: boolean
  placeholder?: string
  hint?: string
  multiline?: boolean
}

export interface CredentialService {
  id: string
  name: string
  tagline: string
  group: CredentialGroupId
  docsUrl: string
  /** connection can be verified with a cheap live API call */
  testable: boolean
  fields: CredentialField[]
}

export const CREDENTIAL_GROUPS: Array<{ id: CredentialGroupId; label: string; description: string }> = [
  {
    id: 'brain',
    label: 'AI Brain',
    description: 'Powers the Sprout agent (bottom-right chat). Add one of these to wake it up — no server access needed.',
  },
  {
    id: 'intelligence',
    label: 'SEO & Market Intelligence',
    description: 'Keyword volumes, rankings, competitors, backlinks and site-audit data.',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure & Automation',
    description: 'Persistent memory and the 24/7 scheduler that runs the daily loop.',
  },
  {
    id: 'outreach',
    label: 'Outreach & Creative',
    description: 'Publisher contact discovery, email verification and editorial imagery.',
  },
  {
    id: 'brand',
    label: 'Per-Brand Connections',
    description: 'Store, analytics and indexing for each brand site (start with Holy Strips).',
  },
]

export const CREDENTIAL_SERVICES: CredentialService[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    tagline: 'The brain — runs the Sprout agent with full intelligence (recommended)',
    group: 'brain',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    testable: true,
    fields: [
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['ANTHROPIC_API_KEY'],
        secret: true,
        required: true,
        placeholder: 'sk-ant-api03-…',
        hint: 'Create it in Anthropic Console → API Keys. Starts with sk-ant-.',
      },
      {
        id: 'model',
        label: 'Model (optional)',
        envVars: ['ANTHROPIC_MODEL'],
        secret: false,
        required: false,
        placeholder: 'claude-sonnet-4-5',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Alternative brain for the Sprout agent',
    group: 'brain',
    docsUrl: 'https://platform.openai.com/api-keys',
    testable: true,
    fields: [
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['OPENAI_API_KEY'],
        secret: true,
        required: true,
        placeholder: 'sk-…',
      },
      {
        id: 'model',
        label: 'Model (optional)',
        envVars: ['OPENAI_MODEL'],
        secret: false,
        required: false,
        placeholder: 'gpt-4o-mini',
      },
    ],
  },
  {
    id: 'dataforseo',
    name: 'DataForSEO',
    tagline: 'Keyword volumes, SERPs, competitors, backlinks — the SEO data engine',
    group: 'intelligence',
    docsUrl: 'https://docs.dataforseo.com/dashboard/my-account',
    testable: true,
    fields: [
      {
        id: 'login',
        label: 'Login (email)',
        envVars: ['DATAFORSEO_LOGIN'],
        secret: false,
        required: true,
        placeholder: 'your@email.com',
      },
      {
        id: 'password',
        label: 'Password',
        envVars: ['DATAFORSEO_PASSWORD'],
        secret: true,
        required: true,
        placeholder: 'DataForSEO account password',
      },
    ],
  },
  {
    id: 'openseo',
    name: 'OpenSEO (open-seo)',
    tagline: 'All-in-one SEO toolbox via MCP — alternative to wiring DataForSEO yourself',
    group: 'intelligence',
    docsUrl: 'https://github.com/every-app/open-seo',
    testable: false,
    fields: [
      {
        id: 'mcpUrl',
        label: 'MCP endpoint URL',
        envVars: ['OPENSEO_MCP_URL'],
        secret: false,
        required: false,
        placeholder: 'https://…/mcp',
      },
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['OPENSEO_API_KEY'],
        secret: true,
        required: false,
        placeholder: 'hosted API key (skip if self-hosting)',
      },
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    tagline: 'Persistent memory — the real database for production data',
    group: 'infrastructure',
    docsUrl: 'https://supabase.com/dashboard/project/_/settings/api',
    testable: true,
    fields: [
      {
        id: 'url',
        label: 'Project URL',
        envVars: ['SUPABASE_URL'],
        secret: false,
        required: true,
        placeholder: 'https://xxxxxxxx.supabase.co',
      },
      {
        id: 'serviceKey',
        label: 'Service role key (secret)',
        envVars: ['SUPABASE_SECRET_KEY'],
        secret: true,
        required: true,
        placeholder: 'sb_secret_… or service_role key',
        hint: 'Project Settings → API → service_role. Server-side only — never share it.',
      },
    ],
  },
  {
    id: 'activepieces',
    name: 'Activepieces',
    tagline: '24/7 scheduler — runs the daily loop when your laptop is off',
    group: 'infrastructure',
    docsUrl: 'https://activepieces.com/docs',
    testable: false,
    fields: [
      {
        id: 'webhookUrl',
        label: 'Webhook URL',
        envVars: ['ACTIVEPIECES_WEBHOOK_URL'],
        secret: false,
        required: false,
        placeholder: 'https://app.activepieces.com/webhooks/…',
      },
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['ACTIVEPIECES_API_KEY'],
        secret: true,
        required: false,
        placeholder: 'Activepieces API key',
      },
    ],
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    tagline: 'Publisher outreach — find and verify contact emails (25 free/month)',
    group: 'outreach',
    docsUrl: 'https://hunter.io/api-keys',
    testable: true,
    fields: [
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['HUNTER_API_KEY'],
        secret: true,
        required: true,
        placeholder: 'xxxxxxxxxxxxxxxx',
      },
    ],
  },
  {
    id: 'smtp',
    name: 'Email Sender (SMTP)',
    tagline: 'Sends the outreach emails automatically — Gmail app password, Brevo, Zoho or any SMTP',
    group: 'outreach',
    docsUrl: 'https://support.google.com/accounts/answer/185833',
    testable: true,
    fields: [
      {
        id: 'host',
        label: 'SMTP host',
        envVars: ['SMTP_HOST'],
        secret: false,
        required: true,
        placeholder: 'smtp.gmail.com',
        hint: 'Gmail: smtp.gmail.com · Brevo: smtp-relay.brevo.com · Zoho: smtp.zoho.com',
      },
      {
        id: 'port',
        label: 'Port',
        envVars: ['SMTP_PORT'],
        secret: false,
        required: false,
        placeholder: '465',
        hint: '465 (recommended) or 587',
      },
      {
        id: 'username',
        label: 'Username (email)',
        envVars: ['SMTP_USERNAME'],
        secret: false,
        required: true,
        placeholder: 'you@gmail.com',
      },
      {
        id: 'password',
        label: 'Password / app password',
        envVars: ['SMTP_PASSWORD'],
        secret: true,
        required: true,
        placeholder: 'Gmail app password (16 characters)',
        hint: 'Gmail requires an app password: Google Account → Security → 2-Step Verification → App passwords.',
      },
      {
        id: 'fromName',
        label: 'From name',
        envVars: ['SMTP_FROM_NAME'],
        secret: false,
        required: false,
        placeholder: 'Holy Strips',
      },
    ],
  },
  {
    id: 'recraft',
    name: 'Recraft',
    tagline: 'Editorial imagery for blog visuals (50 free credits/day)',
    group: 'outreach',
    docsUrl: 'https://www.recraft.ai/developers',
    testable: false,
    fields: [
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['RECRAFT_API_KEY'],
        secret: true,
        required: true,
        placeholder: 'Recraft API key',
      },
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify (store)',
    tagline: 'Publishing & product data for the brand store',
    group: 'brand',
    docsUrl: 'https://shopify.dev/docs/api/admin-graphql',
    testable: true,
    fields: [
      {
        id: 'domain',
        label: 'Store domain',
        envVars: ['SHOPIFY_STORE_DOMAIN'],
        secret: false,
        required: true,
        placeholder: 'holystrips.myshopify.com',
      },
      {
        id: 'accessToken',
        label: 'Admin API access token',
        envVars: ['SHOPIFY_ACCESS_TOKEN'],
        secret: true,
        required: true,
        placeholder: 'shpat_…',
        hint: 'Shopify Admin → Settings → Apps → Develop apps → create a custom app with admin API access.',
      },
    ],
  },
  {
    id: 'google',
    name: 'Google (Search Console + GA4) — Option 1',
    tagline: 'Direct ground-truth rankings and traffic via one service account (kept as the primary option)',
    group: 'brand',
    docsUrl: 'https://developers.google.com/webmaster-tools',
    testable: false,
    fields: [
      {
        id: 'gscSiteUrl',
        label: 'Search Console site URL',
        envVars: ['GSC_SITE_URL'],
        secret: false,
        required: false,
        placeholder: 'https://holystrips.com',
      },
      {
        id: 'ga4PropertyId',
        label: 'GA4 property ID',
        envVars: ['GA4_PROPERTY_ID'],
        secret: false,
        required: false,
        placeholder: '123456789',
      },
      {
        id: 'clientEmail',
        label: 'Service account email',
        envVars: ['GSC_CLIENT_EMAIL', 'GA4_CLIENT_EMAIL'],
        secret: false,
        required: false,
        placeholder: 'sa@your-project.iam.gserviceaccount.com',
      },
      {
        id: 'privateKey',
        label: 'Service account private key',
        envVars: ['GSC_PRIVATE_KEY', 'GA4_PRIVATE_KEY'],
        secret: true,
        required: false,
        placeholder: '-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----',
        multiline: true,
        hint: 'From the service account JSON key file. Grant it access in Search Console (Users & permissions) and GA4.',
      },
    ],
  },
  {
    id: 'porter',
    name: 'Porter Metrics (GSC + GA4) — Option 2',
    tagline: 'Secondary statistics source — connect Google Search Console & GA4 through Porter Metrics with one browser login (no service account JSON). OAuth fields below are filled automatically when you press “Connect Porter” on the Live Stats page.',
    group: 'brand',
    docsUrl: 'https://mcp.portermetrics.com/mcp',
    testable: true,
    fields: [
      {
        id: 'mcpUrl',
        label: 'MCP server URL',
        envVars: ['PORTER_MCP_URL'],
        secret: false,
        required: false,
        placeholder: 'https://mcp.portermetrics.com/mcp',
        hint: 'Porter Metrics MCP endpoint. The default already works — leave empty unless Porter gives you a different URL.',
      },
      {
        id: 'accessToken',
        label: 'Access token (auto — OAuth)',
        envVars: ['PORTER_ACCESS_TOKEN'],
        secret: true,
        required: false,
        placeholder: 'filled automatically after “Connect Porter”',
        hint: 'Managed automatically: created by the OAuth login on the Live Stats page and refreshed as needed.',
      },
      {
        id: 'refreshToken',
        label: 'Refresh token (auto — OAuth)',
        envVars: ['PORTER_REFRESH_TOKEN'],
        secret: true,
        required: false,
        placeholder: 'filled automatically',
      },
      {
        id: 'tokenExpires',
        label: 'Token expiry (auto)',
        envVars: ['PORTER_TOKEN_EXPIRES_AT'],
        secret: false,
        required: false,
        placeholder: 'ISO timestamp',
      },
      {
        id: 'clientId',
        label: 'OAuth client ID (auto)',
        envVars: ['PORTER_CLIENT_ID'],
        secret: false,
        required: false,
        placeholder: 'registered automatically',
      },
    ],
  },
  {
    id: 'bing',
    name: 'Bing Webmaster + IndexNow',
    tagline: 'Bing/Copilot visibility and instant indexing',
    group: 'brand',
    docsUrl: 'https://www.indexnow.org/documentation',
    testable: false,
    fields: [
      {
        id: 'bingApiKey',
        label: 'Bing Webmaster API key',
        envVars: ['BING_API_KEY'],
        secret: true,
        required: false,
        placeholder: 'Bing Webmaster API key',
      },
      {
        id: 'indexnowKey',
        label: 'IndexNow key',
        envVars: ['INDEXNOW_KEY'],
        secret: false,
        required: false,
        placeholder: 'any string of a-z, 0-9, - (published as a key file)',
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Google Merchant Center',
    tagline: 'Product feed health for product-search visibility',
    group: 'brand',
    docsUrl: 'https://developers.google.com/shopping-content',
    testable: false,
    fields: [
      {
        id: 'merchantId',
        label: 'Merchant ID',
        envVars: ['MERCHANT_ID'],
        secret: false,
        required: false,
        placeholder: '123456789',
      },
      {
        id: 'apiKey',
        label: 'API key',
        envVars: ['MERCHANT_CENTER_API_KEY'],
        secret: true,
        required: false,
        placeholder: 'Merchant Center API key',
      },
    ],
  },
]

export function findCredentialService(id: string): CredentialService | null {
  return CREDENTIAL_SERVICES.find((s) => s.id === id) ?? null
}
