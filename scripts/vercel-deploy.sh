#!/bin/bash
# ============================================================
# VERCEL DEPLOY — link the GitHub repo + deploy to production
# Usage: ./scripts/vercel-deploy.sh <VERCEL_TOKEN> [PROJECT_ID_OR_NAME]
# Requires: a Vercel API token (vercel.com/account/tokens).
# Steps:
#   1. Verify the token + find the project
#   2. Link the GitHub repo lebonchemindz-ship-it/organic-growth-os
#   3. Trigger a production deployment from main
#   4. Poll until the deployment is READY and print the URL
# ============================================================
set -euo pipefail

TOKEN="${1:-}"
PROJECT="${2:-organic-growth-os}"
API="https://api.vercel.com"
REPO="lebonchemindz-ship-it/organic-growth-os"

if [ -z "$TOKEN" ]; then
  echo "ERROR: no token given. Usage: $0 <VERCEL_TOKEN> [project]"
  exit 1
fi

auth_header="Authorization: Bearer $TOKEN"

echo "=== 1. Verifying token & user ==="
USER_JSON=$(curl -s -m 20 -H "$auth_header" "$API/v2/user")
USER_NAME=$(echo "$USER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['username'])" 2>/dev/null || echo "?")
echo "Token OK — user: $USER_NAME"

echo "=== 2. Finding project '$PROJECT' ==="
PROJ_JSON=$(curl -s -m 20 -H "$auth_header" "$API/v9/projects/$PROJECT")
PROJ_ID=$(echo "$PROJ_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [ -z "$PROJ_ID" ]; then
  echo "Project '$PROJECT' not found — listing projects:"
  curl -s -m 20 -H "$auth_header" "$API/v9/projects?limit=20" | python3 -c "import sys,json; [print(' -', p['name'], p['id']) for p in json.load(sys.stdin)['projects']]" 2>/dev/null
  exit 1
fi
echo "Project found: $PROJ_ID"
echo "$PROJ_JSON" | python3 -c "
import sys, json
p = json.load(sys.stdin)
link = p.get('link') or {}
repo = (link.get('org','') + '/' + link.get('repo','')) if link.get('repo') else 'NONE'
print('Current git link:', link.get('type') or 'NONE', '| repo:', repo)
"

echo "=== 3. Linking GitHub repo $REPO ==="
LINK_JSON=$(curl -s -m 30 -X PATCH -H "$auth_header" -H 'content-type: application/json' \
  "$API/v9/projects/$PROJ_ID" \
  -d "{\"link\":{\"type\":\"github\",\"org\":\"lebonchemindz-ship-it\",\"repo\":\"organic-growth-os\",\"productionBranch\":\"main\"}}")
LINK_ERR=$(echo "$LINK_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','') or '')" 2>/dev/null || echo "parse-failed")
if [ -n "$LINK_ERR" ]; then
  echo "Link result: $LINK_ERR"
  echo "(If linking is rejected, the Vercel GitHub App may need access to the repo —"
  echo " install it at vercel.com/dashboard → Settings → Git → or use the dashboard link.)"
else
  echo "Repo linked to project."
fi

echo "=== 4. Triggering production deployment from main ==="
DEP_JSON=$(curl -s -m 30 -X POST -H "$auth_header" -H 'content-type: application/json' \
  "$API/v13/deployments" \
  -d "{\"name\":\"$PROJECT\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repo\":\"$REPO\",\"ref\":\"main\"}}")
DEP_ID=$(echo "$DEP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
DEP_ERR=$(echo "$DEP_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','') or '')" 2>/dev/null || echo "")
if [ -z "$DEP_ID" ]; then
  echo "Deployment not created: $DEP_ERR"
  exit 1
fi
echo "Deployment started: $DEP_ID"

echo "=== 5. Polling until READY (max ~6 min) ==="
for i in $(seq 1 40); do
  sleep 9
  ST_JSON=$(curl -s -m 20 -H "$auth_header" "$API/v13/deployments/$DEP_ID")
  READY=$(echo "$ST_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ready',False))" 2>/dev/null || echo "False")
  STATE=$(echo "$ST_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', json.load(sys.stdin).get('state','?')))" 2>/dev/null || echo "?")
  echo "  [$((i*9))s] status: $STATE"
  if [ "$READY" = "True" ]; then
    URL=$(echo "$ST_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
    echo "DEPLOYMENT READY: https://$URL"
    echo "=== 6. Verifying live version ==="
    curl -s -m 20 "https://$URL/api/health" | head -c 300; echo
    curl -s -m 30 "https://$URL/api/data-status" | head -c 800; echo
    exit 0
  fi
done
echo "Deployment still building — check https://vercel.com dashboard."
exit 0
