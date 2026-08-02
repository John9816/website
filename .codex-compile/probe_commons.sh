#!/usr/bin/env bash
set -euo pipefail

queries=(
  "人工智能 城市"
  "technology business"
  "electric vehicle factory"
  "Chinese economy"
)

for query in "${queries[@]}"; do
  echo "--- ${query} ---"
  curl -sS --max-time 20 -G 'https://commons.wikimedia.org/w/api.php' \
    --data-urlencode 'action=query' \
    --data-urlencode 'generator=search' \
    --data-urlencode "gsrsearch=filetype:bitmap ${query}" \
    --data-urlencode 'gsrnamespace=6' \
    --data-urlencode 'gsrlimit=6' \
    --data-urlencode 'prop=imageinfo' \
    --data-urlencode 'iiprop=url|mime|size|extmetadata' \
    --data-urlencode 'iiurlwidth=1024' \
    --data-urlencode 'format=json' \
    --data-urlencode 'origin=*' | head -c 900
  echo
done
