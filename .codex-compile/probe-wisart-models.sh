#!/bin/bash
set -u
KEY='sk-adb300497956f7f753fa3f01122cb6ff'
BASE='https://wisart.kuaileshifu.com'
for model in nano-banana-2-lite nano-banana-2 nano-banana-pro gpt-image-2; do
  echo "=== $model ==="
  # try with response_format url first
  code=$(curl -sS -m 120 -o /tmp/g.json -w "%{http_code}" -X POST "$BASE/v1/images/generations" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"prompt\":\"a simple red apple on white background, product photo\",\"size\":\"1024x1024\",\"n\":1,\"response_format\":\"url\"}")
  echo "url_mode http=$code"
  python3 -c 'import json;d=json.load(open("/tmp/g.json"));e=d.get("error");
print("err", (e.get("message") if isinstance(e,dict) else e)[:180] if e else "none");
data=d.get("data") or [];
print("items",len(data));
print("keys", list(data[0].keys()) if data else []);
print("url",(data[0].get("url") or "")[:120] if data else "");
print("b64",len(data[0].get("b64_json") or "") if data else 0)' 2>/dev/null || head -c 200 /tmp/g.json
  # if failed, try without response_format / with b64
  if [ "$code" != "200" ]; then
    code2=$(curl -sS -m 120 -o /tmp/g2.json -w "%{http_code}" -X POST "$BASE/v1/images/generations" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "{\"model\":\"$model\",\"prompt\":\"a simple red apple on white background\",\"size\":\"1024x1024\",\"n\":1}")
    echo "default_mode http=$code2"
    python3 -c 'import json;d=json.load(open("/tmp/g2.json"));e=d.get("error");
print("err", (str(e.get("message") if isinstance(e,dict) else e)[:180]) if e else "none");
data=d.get("data") or [];
print("items",len(data));
print("url",(data[0].get("url") or "")[:120] if data else "");
print("b64",len(data[0].get("b64_json") or "") if data else 0)' 2>/dev/null || head -c 200 /tmp/g2.json
  fi
  # stop early if success
  if python3 -c 'import json,sys;d=json.load(open("/tmp/g.json"));sys.exit(0 if d.get("data") else 1)' 2>/dev/null; then
    echo "SUCCESS model=$model"
    break
  fi
  if [ -f /tmp/g2.json ] && python3 -c 'import json,sys;d=json.load(open("/tmp/g2.json"));sys.exit(0 if d.get("data") else 1)' 2>/dev/null; then
    echo "SUCCESS model=$model default body"
    break
  fi
done
