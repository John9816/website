#!/usr/bin/env bash
set -euo pipefail

mysql website_java -N -e "
SELECT config_key, config_value
FROM sys_config
WHERE config_key IN (
  'image.api.baseUrl',
  'image.api.model',
  'image.api.key',
  'image.edit.api.baseUrl',
  'content.cover.fallback.enabled',
  'content.cover.fallback.url',
  'content.cover.fallback.model'
)
ORDER BY config_key;"

echo '--- image logs ---'
journalctl -u website-java-api.service -n 220 --no-pager | grep -E 'ImageService|gpt-image|cover-fallback|无可用渠道|uploadimg' | tail -n 80 || true
