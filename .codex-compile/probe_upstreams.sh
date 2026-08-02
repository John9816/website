#!/usr/bin/env bash
set -euo pipefail

chat_base="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")"
chat_key="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")"
chat_models="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.models' LIMIT 1;" | tr -d '\r' | tr '\n' ',')"
image_base="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.baseUrl' LIMIT 1;")"
image_key="$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")"

echo "chat_base=${chat_base}"
echo "image_base=${image_base}"

echo "--- chat /models ---"
curl -sS --max-time 20 -H "Authorization: Bearer ${chat_key}" "${chat_base%/}/models" | head -c 1200 || true
echo

echo "--- chat model probes ---"
IFS=',' read -ra models <<< "${chat_models},mimo-v2-flash,mimo-v2.5,mimo-v2-pro,mimo-v2.5-pro,gpt-4o-mini,gpt-4.1-mini,deepseek-v3,deepseek-chat,claude-3-5-haiku-latest"
seen=""
for model in "${models[@]}"; do
  model="$(echo "$model" | xargs)"
  [[ -z "$model" ]] && continue
  [[ ",$seen," == *",$model,"* ]] && continue
  seen="${seen},${model}"
  body="$(mktemp)"
  code="$(curl -sS --max-time 25 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${chat_key}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"只回复 OK\"}],\"stream\":false}" \
    "${chat_base%/}/chat/completions" || true)"
  printf '%s HTTP %s ' "$model" "$code"
  head -c 180 "$body" | tr '\n' ' '
  echo
  rm -f "$body"
done

echo "--- image /models ---"
image_root="${image_base%%/v1/*}/v1"
curl -sS --max-time 20 -H "Authorization: Bearer ${image_key}" "${image_root}/models" | head -c 1600 || true
echo

echo "--- image model probes ---"
for model in gpt-image-1 gpt-image-2 grok-imagine-image-lite grok-2-image flux kontext-pro seedream-3.0 wanx-v1; do
  body="$(mktemp)"
  code="$(curl -sS --max-time 50 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${image_key}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${model}\",\"prompt\":\"simple editorial photo of a city skyline, no text\",\"n\":1}" \
    "${image_base}" || true)"
  printf '%s HTTP %s ' "$model" "$code"
  head -c 220 "$body" | tr '\n' ' '
  echo
  rm -f "$body"
done
