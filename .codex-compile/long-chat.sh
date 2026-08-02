#!/bin/bash
set -e
ss -lntp | grep 18787
code=$(curl -sS -m 180 -o /tmp/longchat.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d @/tmp/longchat-req.json)
echo long_http=$code
python3 -c "import json;d=json.load(open(\"/tmp/longchat.json\"));m=(d.get(\"choices\") or [{}])[0].get(\"message\") or {};c=m.get(\"content\") or \"\";print(\"content_len\",len(c));print(c[:250])"
