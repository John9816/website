#!/usr/bin/env bash
set -euo pipefail
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
BASE=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")

BODY='{"model":"mimo-v2-flash","messages":[{"role":"system","content":"只返回严格 JSON，字段 title,digest,contentMarkdown,tags。contentMarkdown 至少 3 个 ## 和 1200 字中文公众号正文。"},{"role":"user","content":"主题：AI 换工作焦虑。只输出 JSON。"}],"max_tokens":4096,"temperature":0.7,"stream":true}'

echo "=== stream chat ==="
rm -f /tmp/mimo-stream.txt
set +e
curl -sS -m 400 -N -w "\nhttp=%{http_code}\n" \
  -X POST "${BASE}/chat/completions" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d "$BODY" \
  -o /tmp/mimo-stream.txt
RC=$?
set -e
echo "curl_rc=$RC size=$(wc -c </tmp/mimo-stream.txt)"
tail -c 400 /tmp/mimo-stream.txt; echo
python3 - <<'PY'
import json
raw=open("/tmp/mimo-stream.txt","r",encoding="utf-8",errors="replace").read()
print("raw_len", len(raw))
if raw.strip().startswith("error") or "504" in raw[:50]:
    print("upstream_error", raw[:200])
    raise SystemExit(0)
content=[]
reasoning=[]
for line in raw.splitlines():
    line=line.strip()
    if not line.startswith("data:"):
        continue
    payload=line[5:].strip()
    if payload=="[DONE]":
        break
    try:
        obj=json.loads(payload)
    except Exception:
        continue
    for ch in obj.get("choices") or []:
        delta=ch.get("delta") or {}
        if delta.get("content"):
            content.append(delta["content"])
        if delta.get("reasoning_content"):
            reasoning.append(delta["reasoning_content"])
        msg=ch.get("message") or {}
        if msg.get("content"):
            content.append(msg["content"])
text="".join(content)
print("content_len", len(text), "reasoning_len", len("".join(reasoning)))
print("content_head", text[:500])
start=text.find("{"); end=text.rfind("}")
if start>=0 and end>start:
    try:
        obj=json.loads(text[start:end+1])
        md=obj.get("contentMarkdown") or ""
        print("inner_keys", list(obj.keys()))
        print("md_len", len(md), "h2", md.count("## "))
    except Exception as e:
        print("inner_fail", e)
else:
    print("no json braces")
PY
