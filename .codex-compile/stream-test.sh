#!/bin/bash
# stream-like long nonstream request with max_tokens 1200
code=$(curl -sS -m 300 -o /tmp/med.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","stream":true,"messages":[{"role":"user","content":"写一篇约900字中文公众号文章，主题：普通人用AI提效的三个习惯。用markdown。"}],"max_tokens":2000}')
echo http=$code size=$(wc -c </tmp/med.json)
# count data lines
grep -c '^data:' /tmp/med.json || true
tail -c 200 /tmp/med.json; echo
# extract content roughly
python3 - <<'PY'
import json
text=open("/tmp/med.json",encoding="utf-8",errors="ignore").read().splitlines()
acc=[]
for line in text:
  if not line.startswith("data:"): continue
  p=line[5:].strip()
  if p=="[DONE]": break
  try:
    d=json.loads(p)
  except Exception:
    continue
  ch=(d.get("choices") or [{}])[0]
  delta=ch.get("delta") or {}
  c=delta.get("content")
  if c: acc.append(c)
print("stream_content_len", sum(len(x) for x in acc))
print("".join(acc)[:200])
PY