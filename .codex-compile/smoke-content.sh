#!/bin/bash
set -u
echo "=== services ==="
systemctl is-active website-java-api
systemctl is-active website-api
systemctl is-active website-ecs
echo "=== ports ==="
ss -lntp | grep -E '8090|8080|3000' || true
echo "=== jar mappings ==="
python3 -c 'import zipfile; z=zipfile.ZipFile("/opt/website-java-api/website.jar"); data=z.read("BOOT-INF/classes/com/example/website/controller/AdminContentController.class");
print("generate-async", "OK" if b"generate-async" in data else "MISSING");
print("revise", "OK" if b"revise" in data else "MISSING");
print("visuals", "OK" if b"visuals" in data else "MISSING")'
echo "=== public ==="
curl -s -o /dev/null -w "categories=%{http_code}\n" http://127.0.0.1:8090/api/public/categories
echo "=== admin POST without auth ==="
for path in /api/admin/content/articles/generate-async /api/admin/content/articles/generate /api/admin/content/articles/1/revise /api/admin/content/articles/1/visuals /api/admin/content/automation/run; do
  code=$(curl -s -o /tmp/body.json -w "%{http_code}" -X POST "http://127.0.0.1:8090$path" -H "Content-Type: application/json" -d "{}")
  msg=$(python3 -c "import json;print(json.load(open(\"/tmp/body.json\")).get(\"message\",\"\"))" 2>/dev/null || echo raw)
  echo "POST $path => $code | $msg"
done
echo "=== admin GET without auth ==="
for path in /api/admin/content/status /api/admin/content/hot /api/admin/content/articles; do
  code=$(curl -s -o /tmp/body.json -w "%{http_code}" "http://127.0.0.1:8090$path")
  msg=$(python3 -c "import json;print(json.load(open(\"/tmp/body.json\")).get(\"message\",\"\"))" 2>/dev/null || echo raw)
  echo "GET $path => $code | $msg"
done
echo "=== nginx recent content errors ==="
grep -E "generate-async|revise|visuals" /var/log/nginx/access.log | tail -12 || true
echo "=== java recent ==="
journalctl -u website-java-api --since "40 min ago" --no-pager | grep -iE "Request method|Unhandled exception|Started Website|ERROR" | tail -25 || true