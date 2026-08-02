SELECT id, title, cover_image_url, quality_score, error_message
FROM content_article
WHERE id = 27;

SELECT risk_tips_json
FROM content_article
WHERE id = 27;

SELECT inline_images_json
FROM content_article
WHERE id = 27;

SELECT config_key, LEFT(config_value, 160) AS value_preview
FROM sys_config
WHERE config_key IN (
  'ai.chat.baseUrl',
  'ai.chat.model',
  'ai.chat.apiKey',
  'image.api.baseUrl',
  'image.api.model',
  'image.api.key',
  'wechat.coverMediaId'
)
ORDER BY config_key;
