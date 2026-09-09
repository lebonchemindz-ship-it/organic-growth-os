#!/bin/bash
# Focused debug: fill key → save → inspect network + page text
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
NAVREF=@$(echo "$SNAP" | grep 'button "API Keys"' | grep -oE 'e[0-9]+' | head -1)
agent-browser click "$NAVREF" 2>&1 | head -1
sleep 2

SNAP2=$(agent-browser snapshot -i 2>&1)
PINREF=@$(echo "$SNAP2" | grep 'Settings PIN' | grep -oE 'e[0-9]+' | head -1)
agent-browser fill "$PINREF" "139574" 2>&1 | head -1
UNLOCKREF=@$(echo "$SNAP2" | grep 'button "Unlock"' | grep -oE 'e[0-9]+' | head -1)
agent-browser click "$UNLOCKREF" 2>&1 | head -1
sleep 2

SNAP3=$(agent-browser snapshot -i 2>&1)
KEYREF=@$(echo "$SNAP3" | grep 'textbox "API key"' | grep -oE 'e[0-9]+' | head -1)
SAVEREF=@$(echo "$SNAP3" | grep 'button "Save"' | grep -oE 'e[0-9]+' | head -1)
echo "KEYREF=$KEYREF SAVEREF=$SAVEREF"

agent-browser fill "$KEYREF" "sk-ant-fake-key-123456789" 2>&1 | head -1
echo "--- input value after fill ---"
agent-browser get value "$KEYREF" 2>&1 | head -2
echo "--- button state ---"
agent-browser is enabled "$SAVEREF" 2>&1 | head -1

agent-browser click "$SAVEREF" 2>&1 | head -1
sleep 6

echo "--- network requests to /api/keys ---"
agent-browser network requests --filter "api/keys" 2>&1 | head -10
echo "--- page text around feedback (anthropic card) ---"
agent-browser snapshot 2>&1 | grep -A3 -B1 -iE "saved|error|failed|invalid" | head -20

agent-browser close 2>&1 | head -1
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo DONE
