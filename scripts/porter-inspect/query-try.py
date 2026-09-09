#!/usr/bin/env python3
"""Try query_data with the correct accounts[] + date_range shapes against real GSC."""
import base64, hashlib, json, sqlite3, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FALLBACK = b"organic-growth-os::credential-vault::v1::fallback-key"
key = hashlib.sha256(FALLBACK).digest()
con = sqlite3.connect("/home/z/my-project/db/custom.db")
row = con.execute("SELECT valuesEnc FROM Credential WHERE service='porter'").fetchone()
iv, tag, ct = row[0].split(":")
cipher = AESGCM(key)
pt = cipher.decrypt(base64.b64decode(iv), base64.b64decode(ct) + base64.b64decode(tag), None)
values = json.loads(pt.decode())
TOKEN = values["accessToken"]

MCP_URL = "https://mcp.portermetrics.com/mcp"
GSC = "google-search-console"
ACCOUNT = "cObghELadc3AYwpw6c1_DQ.google-search-console~https://holystrips.com/~google-search-console-109361985828181728361~ddda7704-abde-4bdc-8b68-bb879f7a5aae~https://holystrips.com/"

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
        with urllib.request.urlopen(req, timeout=90) as res:
            return res.headers.get("mcp-session-id") or session, res.read().decode()
    except urllib.error.HTTPError as e:
        return session, f"HTTP {e.code}: {e.read().decode()[:500]}"

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

sid, raw = rpc("", {"jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "organic-growth-os", "version": "1.6.0"}}})
rpc(sid, {"jsonrpc": "2.0", "method": "notifications/initialized"})

def call(name, args, ident):
    global sid
    sid, raw = rpc(sid, {"jsonrpc": "2.0", "id": ident, "method": "tools/call",
        "params": {"name": name, "arguments": args}})
    data = parse(raw)
    if not data:
        return None, raw[:400]
    res = data.get("result", {})
    if res.get("isError"):
        content = res.get("content") or []
        err = content[0].get("text", "")[:600] if content else "error"
        return None, err
    # extract data
    sc = res.get("structuredContent")
    if sc is not None:
        return sc, None
    content = res.get("content") or []
    texts = [c.get("text", "") for c in content if isinstance(c, dict)]
    if texts:
        try:
            return json.loads(texts[0]), None
        except Exception:
            return texts[0], None
    return res, None

# 1. list_fields for GSC
fields, err = call("list_fields", {"connector": GSC}, 2)
print("=== list_fields ===")
if err: print("ERR:", err)
else:
    flist = fields if isinstance(fields, list) else (fields.get("fields") or fields.get("data") or [])
    print(json.dumps(flist, default=str)[:1500])

# 2. query_data attempts
from_text = "2026-06-11"
to_text = "2026-09-09"
attempts = [
    ("accounts+date_range{start,end}", {"connector": GSC, "accounts": [ACCOUNT], "metrics": ["clicks", "impressions", "position"], "dimensions": ["query"], "date_range": {"start": from_text, "end": to_text}, "limit": 20}),
    ("accounts+date_range{start_date,end_date}", {"connector": GSC, "accounts": [ACCOUNT], "metrics": ["clicks", "impressions", "position"], "dimensions": ["query"], "date_range": {"start_date": from_text, "end_date": to_text}, "limit": 20}),
    ("accounts+date_range{from,to}", {"connector": GSC, "accounts": [ACCOUNT], "metrics": ["clicks", "impressions", "position"], "dimensions": ["query"], "date_range": {"from": from_text, "to": to_text}, "limit": 20}),
]
ident = 10
for label, args in attempts:
    ident += 1
    data, err = call("query_data", args, ident)
    print(f"\n=== query_data: {label} ===")
    if err:
        print("ERR:", err[:500])
    else:
        s = json.dumps(data, default=str)
        print("OK! length:", len(s))
        print(s[:1200])
        break
