#!/bin/bash
mysql -N website_java -e "SELECT config_key, LEFT(config_value,80) FROM sys_config WHERE config_key LIKE '%apiKey%' OR config_key LIKE '%api.key%' OR config_key LIKE '%token%' OR config_value LIKE 'sk-%' ORDER BY config_key;"
# try dig more for fufu
echo "==== fufu dns ===="
dig +short fufu.iqach.top A 2>/dev/null || true
dig +short fufu.iqach.top AAAA 2>/dev/null || true
# try cloudflare resolve variants
for ip in 1.1.1.1 8.8.8.8; do
  dig @$ip +short fufu.iqach.top A 2>/dev/null | head -3
done
# try http not https
curl -sS -m 10 -o /dev/null -w "http_fufu=%{http_code}\n" http://fufu.iqach.top/v1/models || true
# traceroute first hop
timeout 15 traceroute -n -w 2 -q 1 fufu.iqach.top 2>/dev/null | head -8 || true
# check if proxy env
env | grep -i proxy || true
# list any other base urls in history tables
mysql -N website_java -e "SHOW TABLES;" | head -40
