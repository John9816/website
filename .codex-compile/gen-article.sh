#!/bin/bash
set -e
LOGIN=$(curl -sS -m 15 -X POST http://127.0.0.1:8090/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"codex_verify_0718","password":"CodexVerify0718!"}')
echo "login=$LOGIN"
TOKEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("data",{}).get("token") or d.get("token") or "")' "$LOGIN")
if [ -z "$TOKEN" ]; then
  TOKEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print((d.get("data") or {}).get("accessToken") or (d.get("data") or {}).get("jwt") or "")' "$LOGIN")
fi
echo "token_len=${#TOKEN}"
# dump keys
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(list(d.keys()), list((d.get("data") or {}).keys()) if isinstance(d.get("data"),dict) else d.get("data"))' "$LOGIN"
# start async generate
RESP=$(curl -sS -m 30 -X POST http://127.0.0.1:8090/api/admin/content/articles/generate-async \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"普通人如何用AI提高职场效率","category":"职场成长"}')
echo "job=$RESP"
echo "$TOKEN" > /tmp/admin.token
echo "$RESP" > /tmp/gen.job.json