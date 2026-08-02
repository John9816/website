#!/usr/bin/env bash
set -euo pipefail
cd /opt/website-java-api
if [[ ! -f website.jar.new ]]; then
  echo "missing website.jar.new"
  exit 1
fi
ts=$(date +%Y%m%d_%H%M%S)
cp -a website.jar "website.jar.bak_${ts}"
mv website.jar.new website.jar
ls -la website.jar
systemctl restart website-java-api
sleep 8
systemctl is-active website-java-api
# probe common ports
for p in 8090 8080 8088 9000; do
  code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${p}/" || true)
  echo "port ${p} -> ${code}"
done
ss -lntp | grep -E 'java|8090|8080' || true
journalctl -u website-java-api -n 30 --no-pager
