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
systemctl restart website-java-api
for i in $(seq 1 30); do
  if curl -sS -m 2 -o /dev/null -w '' http://127.0.0.1:8090/ 2>/dev/null; then
    echo "ready after ${i}s"
    break
  fi
  # 404 still means Tomcat is up
  code=$(curl -sS -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/ 2>/dev/null || true)
  if [[ "$code" != "000" && -n "$code" ]]; then
    echo "ready http=$code after ${i}s"
    break
  fi
  sleep 1
done
systemctl is-active website-java-api
curl -sS -m 3 -o /dev/null -w "http=%{http_code}\n" http://127.0.0.1:8090/ || true
