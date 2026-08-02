#!/usr/bin/env bash
set -euo pipefail

chat_base="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")"
chat_key="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")"

prompt='围绕“AI 搜索结果开始重塑普通人获取信息的路径”，写一个微信公众号正文小节。小标题：搜索入口变了，判断成本也变了。要求：只输出正文段落，中文 350-450 字，具体、有判断，不要提纲。'

for model in deepseek-chat mimo-v2-flash mimo-v2.5-pro; do
  body="$(mktemp)"
  code="$(curl -sS --max-time 80 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${chat_key}" \
    -H "Content-Type: application/json" \
    --data "$(python3 - <<PY
import json
print(json.dumps({
  "model": "${model}",
  "messages": [
    {"role":"system","content":"你是微信公众号主编。直接输出中文正文。"},
    {"role":"user","content": ${prompt@Q}}
  ],
  "stream": False,
  "max_tokens": 1000,
  "temperature": 0.7
}, ensure_ascii=False))
PY
)" \
    "${chat_base%/}/chat/completions" || true)"
  size="$(wc -c < "$body")"
  printf '%s HTTP %s size=%s ' "$model" "$code" "$size"
  head -c 300 "$body" | tr '\n' ' '
  echo
  rm -f "$body"
done
