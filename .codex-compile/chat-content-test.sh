#!/bin/bash
code=$(curl -sS -m 120 -o /tmp/chat2.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'EOF'
{"model":"mimo-v2-flash","messages":[{"role":"user","content":"用中文写一段80字公众号开篇，主题：职场信息差。只输出正文。"}],"max_tokens":400}
EOF
)
echo chat_http=$code
python3 - <<'PY'
import json
d=json.load(open("/tmp/chat2.json"))
m=(d.get("choices") or [{}])[0].get("message") or {}
print("keys", list(m.keys()))
c=m.get("content")
r=m.get("reasoning_content")
print("content_type", type(c).__name__, "len", len(c) if isinstance(c,str) else c)
print("content", (c or "")[:500])
print("reasoning_len", len(r) if isinstance(r,str) else r)
print("reasoning_head", (r or "")[:200] if isinstance(r,str) else r)
# also try mimo-v2.5-pro
PY
code=$(curl -sS -m 120 -o /tmp/chat3.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'EOF'
{"model":"mimo-v2.5-pro","messages":[{"role":"user","content":"用中文写一段80字公众号开篇，主题：职场信息差。只输出正文。"}],"max_tokens":400}
EOF
)
echo pro_http=$code
python3 - <<'PY'
import json
d=json.load(open("/tmp/chat3.json"))
m=(d.get("choices") or [{}])[0].get("message") or {}
print("pro_keys", list(m.keys()))
c=m.get("content")
print("pro_content", (c or str(d))[:500])
PY