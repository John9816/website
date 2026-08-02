#!/bin/bash
set -u
echo "=== unsplash reach ==="
curl -sS -m 15 -o /dev/null -w "unsplash=%{http_code} size=%{size_download}\n" "https://images.unsplash.com/photo-1518770660439-4636190af475?w=512&q=80"
echo "=== wiki ==="
curl -sS -m 15 -o /dev/null -w "wiki=%{http_code}\n" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=city&format=json"
echo "=== recent articles visuals ==="
mysql website_java -e "SELECT id, title, quality_score, status, LEFT(error_message,120) err, CASE WHEN cover_image_url IS NULL OR cover_image_url='' THEN 0 ELSE 1 END has_cover, LEFT(cover_image_url,80) cover FROM content_article ORDER BY id DESC LIMIT 5;"
mysql website_java -e "SELECT id, LEFT(inline_images_json,400) imgs FROM content_article ORDER BY id DESC LIMIT 1\G"
