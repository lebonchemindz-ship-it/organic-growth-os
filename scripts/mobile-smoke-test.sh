#!/usr/bin/env bash
# Mobile smoke test v2: use refs from drawer snapshot for reliable clicking
set -e
cd /home/z/my-project
SECTIONS=("Growth Agent" "Overview" "Live Stats" "Opportunities" "Keywords" "Content Engine" "Outreach & Authority" "AI Visibility" "Approvals" "Weekly Report" "API Keys" "Brands" "Integrations" "The OS — Prompt" "APIs Required")
agent-browser set viewport 414 900 >/dev/null 2>&1
for S in "${SECTIONS[@]} do"; do :; done 2>/dev/null || true
for S in "${SECTIONS[@]}"; do
  agent-browser find role button click --name "Open navigation" >/dev/null 2>&1 || true
  sleep 1
  REF=$(agent-browser snapshot -i -c 2>/dev/null | grep -F "button \"$S\"" | head -1 | sed -E 's/.*\[ref=([a-z0-9]+)\].*/\1/')
  if [ -z "$REF" ]; then echo "❌ NO-REF: $S"; continue; fi
  agent-browser click "@$REF" >/dev/null 2>&1 || { echo "❌ CLICK-FAIL: $S"; continue; }
  sleep 2.5
  H=$(agent-browser eval "document.querySelector('h1')?.textContent || 'NO-H1'" 2>/dev/null | tail -1 | tr -d '"')
  echo "→ $S | h1: $H $([ "$H" = "$S" ] && echo '✓' || echo '⚠️')"
done
echo "=== PAGE ERRORS ==="
agent-browser errors 2>&1 | head -6
echo "=== DONE ==="
