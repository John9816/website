set -e
TS=$(date +%Y%m%d_%H%M%S)
cp -a /opt/website-java-api/website.jar /opt/website-java-api/website.jar.bak_$TS
cp /tmp/website-java-api-new.jar /opt/website-java-api/website.jar
# Ensure activity columns exist before restart (also added by ddl-auto)
mysql -uroot website_java <<'SQL'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS register_ip VARCHAR(45) DEFAULT NULL AFTER avatar_url,
  ADD COLUMN IF NOT EXISTS last_login_at DATETIME(6) DEFAULT NULL AFTER register_ip,
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) DEFAULT NULL AFTER last_login_at,
  ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0 AFTER last_login_ip;
SQL
systemctl restart website-java-api.service
sleep 4
systemctl is-active website-java-api.service
curl -sS -o /tmp/detail-probe.json -w "%{http_code}" http://127.0.0.1:8090/api/admin/users/1 || true
echo
head -c 300 /tmp/detail-probe.json; echo
journalctl -u website-java-api -n 25 --no-pager
