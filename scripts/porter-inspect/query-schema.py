#!/usr/bin/env python3
"""Probe Porter MCP: get fresh token from local vault, discover query_data schema."""
import base64, hashlib, json, sqlite3, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ---- 1. fresh porter token from local DB vault ----
FALLBACK = b"organic-growth-os::credential-vault::v1::fallback-key"
key = hashlib.sha256(FALLBACK).digest()
con = sqlite3.connect("/home/z/my-project/db/custom.db")
row = con.execute("SELECT valuesEnc FROM Credential WHERE service='porter'").fetchone()
if not row:
    print("no porter row in local DB — using env token", file=sys.stderr)
    for line in open("/tmp/porter-env.sh"):
        if line.startswith("export PORTER_ACCESS_TOKEN="):
            TOKEN = line.strip().split("=", 1)[1].strip('"')
else:
    iv, tag, ct = row[0].split(":")
    cipher = AESGCM(key)
    pt = cipher.decrypt(base64.b64decode(iv) + base64.b64decode(ct) + base64.b64decode(tag), None) if False else None
    # AESGCM expects iv + ciphertext + tag
    pt = cipher.decrypt(base64.b64decode(iv), base64.b64decode(ct) + base64.b64decode(tag), None)
    values = json.loads(pt.decode())
    TOKEN = values.get("accessToken", "")
    print("fresh token from vault, expires:", values.get("tokenExpires"), file=sys.stderr)

MCP_URL = "https://mcp.portermetrics.com/mcp"

def rpc(session, body):
    headers = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "authorization": f"Bearer {TOKEN}",
    }
    if session:
        headers["mcp-session-id"] = session
    req = urllib.request.Request(MCP_URL, data=json.dumps(body).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.headers.get("mcp-session-id") or session, res.read().decode()
    except urllib.error.HTTPError as e:
        return session, f"HTTP {e.code}: {e.read().decode()[:300]}"

def parse(raw):
    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith("data:"):
            try:
                j = json.loads(line[5:].strip())
                if isinstance(j, dict):
                    return j
            except Exception:
                pass
    try:
        return json.loads(raw)
    except Exception:
        return None

# initialize
sid, raw = rpc("", {"jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "organic-growth-os", "version": "1.6.0"}}})
print("init sid:", sid[:24] if sid else "none", "| raw:", raw[:120].replace("\n", " "), file=sys.stderr)

# notifications/initialized
rpc(sid, {"jsonrpc": "2.0", "method": "notifications/initialized"})

# tools/list
sid, raw = rpc(sid, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
data = parse(raw)
tools = (data or {}).get("result", {}).get("tools", [])
print("TOOLS:", [t["name"] for t in tools], file=sys.stderr)
for t in tools:
    if t["name"] == "query_data":
        print(json.dumps(t.get("inputSchema", {}), indent=2, default=str))
