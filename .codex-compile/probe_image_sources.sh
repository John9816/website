#!/usr/bin/env bash
set -euo pipefail

urls=(
  "https://source.unsplash.com/1024x768/?technology"
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1024&q=80"
  "https://picsum.photos/1024/768"
  "https://loremflickr.com/1024/768/technology"
  "https://api.dujin.org/bing/1920.php"
)

for url in "${urls[@]}"; do
  echo "--- ${url} ---"
  curl -L -sS --max-time 20 -o /tmp/probe_img.bin -w 'http=%{http_code} type=%{content_type} size=%{size_download} final=%{url_effective}\n' "$url" || true
  file /tmp/probe_img.bin || true
done
