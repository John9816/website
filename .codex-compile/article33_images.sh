#!/usr/bin/env bash
set -euo pipefail

mysql website_java -N -e "
SELECT
  id,
  status,
  wechat_media_id,
  cover_image_url,
  inline_images_json LIKE '%wechat_url%',
  inline_images_json LIKE '%mmbiz%',
  content_html LIKE '%<img%',
  content_html LIKE '%mmbiz%'
FROM content_article
WHERE id = 33;"

mysql website_java -N -e "SELECT inline_images_json FROM content_article WHERE id = 33;" | python3 -c '
import json, sys
raw = sys.stdin.read()
data = json.loads(raw)
for img in data:
    print("slot=%s status=%s source=%s sourceUrl=%s wechatUrl=%s" % (
        img.get("slotId"), img.get("status"), img.get("sourceType"),
        img.get("sourceUrl"), img.get("wechatUrl")
    ))
'

mysql website_java -N -e "SELECT content_html FROM content_article WHERE id = 33;" \
  | grep -o "src=\"[^\"]*\"" | head -n 10
