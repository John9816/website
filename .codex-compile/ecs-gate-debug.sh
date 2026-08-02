#!/usr/bin/env bash
mysql website_java -e "SELECT id,user_id,status,quality_score,image_mode,LEFT(title,50) t,LEFT(IFNULL(error_message,''),160) e,LEFT(IFNULL(wechat_media_id,''),24) wx FROM content_article ORDER BY id DESC LIMIT 8\G"
echo "=== latest risks/review ==="
mysql website_java -N -e "SELECT id, LEFT(risk_tips_json,400), LEFT(review_json,300), CHAR_LENGTH(content_markdown), cover_image_url IS NOT NULL, LEFT(IFNULL(inline_images_json,''),200) FROM content_article ORDER BY id DESC LIMIT 3;"
