#!/usr/bin/env bash
set -euo pipefail

chat_base="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")"
chat_key="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")"

prompt='请写一篇可直接发布的微信公众号文章。主题：AI 搜索结果开始重塑普通人获取信息的路径。栏目：科技 / 互联网。角度：搜索入口变化、内容平台分发、普通人的判断成本。要求：只输出 JSON，不要代码块。字段 title,digest,contentMarkdown,contentHtml,coverPrompt,tags,riskTips。contentMarkdown 从 # 标题开始，正文必须是中文，1800-2200 字，3-5 个 ## 小标题，必须有参考资料和结尾互动问题。不要输出提纲、方案、素材清单。'

for model in deepseek-chat deepseek-v3 mimo-v2-flash mimo-v2.5; do
  body="$(mktemp)"
  code="$(curl -sS --max-time 120 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${chat_key}" \
    -H "Content-Type: application/json" \
    --data "$(python3 - <<PY
import json
print(json.dumps({
  "model": "${model}",
  "messages": [
    {"role":"system","content":"你是微信公众号主编。只输出严格 JSON。"},
    {"role":"user","content": ${prompt@Q}}
  ],
  "stream": False,
  "max_tokens": 3500,
  "temperature": 0.7
}, ensure_ascii=False))
PY
)" \
    "${chat_base%/}/chat/completions" || true)"
  size="$(wc -c < "$body")"
  printf '%s HTTP %s size=%s ' "$model" "$code" "$size"
  head -c 240 "$body" | tr '\n' ' '
  echo
  rm -f "$body"
done
