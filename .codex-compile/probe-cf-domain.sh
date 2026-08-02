#!/bin/bash
for url in \
  "https://api.751152.xyz/" \
  "https://hi.751152.xyz/" \
  "https://api.751152.xyz/api/health" \
  "https://workers.dev/"
do
  code=$(curl -sS -m 15 -o /tmp/o.html -w "%{http_code}" "$url" 2>/dev/null || echo fail)
  echo "$code  $url"
  head -c 80 /tmp/o.html 2>/dev/null; echo
done
