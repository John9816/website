#!/bin/bash
for url in \
  "https://www.cloudflare.com" \
  "https://1.1.1.1" \
  "https://api.github.com" \
  "https://www.baidu.com" \
  "https://api.xiaomimimo.com/v1/models" \
  "https://wisart.kuaileshifu.com/v1/models" \
  "https://fufu.iqach.top/v1/models"
do
  code=$(curl -sS -m 12 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo fail)
  echo "$code  $url"
done
# check if http_proxy configured systemwide
cat /etc/environment 2>/dev/null | head -20
ls /etc/systemd/system/website-java-api.service
cat /etc/systemd/system/website-java-api.service
