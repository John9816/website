#!/usr/bin/env bash
set -euo pipefail

mysql website_java -N -e "
INSERT INTO sys_config (config_key, config_value, description, created_at, updated_at)
VALUES
  ('content.writer.fallbackModels', 'deepseek-v3,deepseek-chat,mimo-v2-flash,mimo-v2.5,mimo-v2-pro', 'Fallback writer models for publication-ready content factory.', NOW(6), NOW(6)),
  ('content.cover.fallback.url', 'https://img.regenin.online/api/chat', 'Optional SSE endpoint for cover-image fallback.', NOW(6), NOW(6)),
  ('content.cover.fallback.model', 'GPT Image 2.0', 'Model label sent to the cover-image fallback endpoint.', NOW(6), NOW(6)),
  ('content.cover.fallback.ratio', '16:9', 'Aspect ratio sent to the cover-image fallback endpoint.', NOW(6), NOW(6)),
  ('content.cover.fallback.resolution', '2K', 'Resolution sent to the cover-image fallback endpoint.', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  description = VALUES(description),
  updated_at = NOW(6);"

mysql website_java -N -e "
SELECT config_key, config_value
FROM sys_config
WHERE config_key IN (
  'content.writer.fallbackModels',
  'content.cover.fallback.url',
  'content.cover.fallback.model',
  'content.cover.fallback.ratio',
  'content.cover.fallback.resolution'
)
ORDER BY config_key;"
