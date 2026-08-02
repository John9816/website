#!/usr/bin/env bash
set -euo pipefail

mysql website_java -N -e "
SELECT
  config_key,
  CASE
    WHEN config_key LIKE '%key%' OR config_key LIKE '%secret%' THEN CONCAT(LEFT(config_value,6),'***')
    ELSE config_value
  END
FROM sys_config
WHERE config_key IN (
  'ai.chat.baseUrl',
  'ai.chat.defaultModel',
  'ai.chat.models',
  'content.writer.fallbackModels',
  'image.api.baseUrl',
  'image.api.model',
  'content.cover.fallback.enabled',
  'content.cover.fallback.url',
  'content.cover.fallback.model',
  'content.cover.fallback.ratio',
  'content.cover.fallback.resolution',
  'content.search.provider',
  'content.search.apiKey',
  'wechat.freePublishEnabled',
  'wechat.coverMediaId'
)
ORDER BY config_key;"

echo '--- recent content logs ---'
journalctl -u website-java-api.service -n 160 --no-pager \
  | grep -E 'AI writer|cover-fallback|Image generation|Upstream|OpenImage|Inline image|无可用渠道|504|401|Wikimedia|uploadimg' || true
