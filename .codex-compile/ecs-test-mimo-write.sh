#!/usr/bin/env bash
set -euo pipefail
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
BASE=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")
echo "BASE=$BASE"
echo "KEY_PREFIX=${KEY:0:12}..."

BODY='{"model":"mimo-v2-flash","messages":[{"role":"system","content":"你是微信公众号增长主笔。只返回严格 JSON，不要 Markdown 围栏。字段：title,digest,contentMarkdown,contentHtml,coverPrompt,tags,riskTips。正文至少 3 个 ## 小节，约 1500 字，像真实文章，禁止提纲与写作教学。"},{"role":"user","content":"请写一篇关于「AI 换工作焦虑」的公众号正文 JSON。"}],"max_tokens":8192,"temperature":0.7,"stream":false}'

echo "=== non-stream chat ==="
set +e
curl -sS -m 300 -w "\nhttp=%{http_code}\n" \
  -X POST "${BASE}/chat/completions" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  -o /tmp/mimo-write.json
RC=$?
set -e
echo "curl_rc=$RC"
ls -la /tmp/mimo-write.json
python3 - <<'PY'
import json
p="/tmp/mimo-write.json"
raw=open(p,"r",encoding="utf-8",errors="replace").read()
print("raw_len", len(raw))
print("raw_head", raw[:1000])
try:
    data=json.loads(raw)
except Exception as e:
    print("json_err", e)
    raise SystemExit(0)
if "error" in data:
    print("error", data["error"])
ch=data.get("choices") or []
print("choices", len(ch))
if ch:
    msg=ch[0].get("message") or {}
    content=msg.get("content")
    reasoning=msg.get("reasoning_content")
    print("content_type", type(content).__name__, "content_len", len(content or "") if content else 0)
    print("reasoning_len", len(reasoning or "") if reasoning else 0)
    print("content_head", repr((content or "")[:600]))
    text=content or ""
    if "```" in text:
        print("has_fence")
    try:
        start=text.find("{")
        end=text.rfind("}")
        if start>=0 and end>start:
            obj=json.loads(text[start:end+1])
            print("inner_keys", list(obj.keys()))
            md=obj.get("contentMarkdown") or obj.get("markdown") or ""
            print("md_len", len(md), "h2", md.count("## "), "paras", md.count("\n\n"))
            print("md_head", md[:400])
        else:
            print("no_json_object_in_content")
    except Exception as e:
        print("inner_parse_fail", type(e).__name__, e)
print("finish", (ch[0].get("finish_reason") if ch else None), "usage", data.get("usage"))
PY
