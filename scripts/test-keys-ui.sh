#!/bin/bash
# FINAL browser UI test for the API Keys page (correct selectors)
set -u
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
rm -f .next/dev/lock
SETTINGS_PIN="139574" setsid npx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/health" --max-time 5 2>/dev/null)
  [ "$code" = "200" ] && { echo "SERVER UP"; break; }
  sleep 1
done

agent-browser open http://localhost:3000 --wait networkidle --timeout 90000 2>&1 | head -1
SNAP=$(agent-browser snapshot -i 2>&1)
agent-browser click @$(echo "$SNAP" | grep 'button "API Keys"' | grep -oE 'e[0-9]+' | head -1) 2>&1 | head -1
agent-browser wait --text "PIN-protected" --timeout 20000 2>&1 | head -1

SNAP2=$(agent-browser snapshot -i 2>&1)
agent-browser fill @$(echo "$SNAP2" | grep 'Settings PIN' | grep -oE 'e[0-9]+' | head -1) "139574" 2>&1 | head -1
agent-browser click @$(echo "$SNAP2" | grep 'button "Unlock"' | grep -oE 'e[0-9]+' | head -1) 2>&1 | head -1
agent-browser wait --text "AI Brain" --timeout 20000 2>&1 | head -1
agent-browser screenshot /home/z/my-project/download/api-keys-unlocked.png --full 2>&1 | head -1

SNAP3=$(agent-browser snapshot -i 2>&1)
# anthropic's required API key field has the accessible name "API key*"
KEYREF=@$(echo "$SNAP3" | grep 'textbox "API key\*"' | grep -oE 'e[0-9]+' | head -1)
SAVEREF=@$(echo "$SNAP3" | grep 'button "Save"' | grep -oE 'e[0-9]+' | head -1)
echo "KEYREF=$KEYREF SAVEREF=$SAVEREF"

agent-browser fill "$KEYREF" "sk-ant-fake-key-123456789" 2>&1 | head -1
agent-browser is enabled "$SAVEREF" 2>&1 | head -1
agent-browser click "$SAVEREF" 2>&1 | head -1
agent-browser wait --text "Saved" --timeout 30000 2>&1 | head -1
agent-browser wait --text "Connected" --timeout 20000 2>&1 | head -1
agent-browser screenshot /home/z/my-project/download/api-keys-saved.png --full 2>&1 | head -1

# Test connection button (first = anthropic's)
TESTREF=@$(echo "$SNAP3" | grep 'button "Test connection"' | grep -oE 'e[0-9]+' | head -1)
agent-browser click "$TESTREF" 2>&1 | head -1
agent-browser wait --text "Rejected" --timeout 40000 2>&1 | head -1
agent-browser screenshot /home/z/my-project/download/api-keys-tested.png --full 2>&1 | head -1

echo "--- console errors ---"
agent-browser errors 2>&1 | head -4
agent-browser console 2>&1 | grep -iE "error|warn" | head -4
echo "--- (nothing above = clean) ---"

node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.credential.findMany().then(r=>{console.log('DB rows after save:',r.map(x=>x.service));return p.\$disconnect()}).catch(e=>console.log('ERR'))"

agent-browser close 2>&1 | head -1
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "DONE"
