#!/bin/bash
for p in admin123 Admin123 password 123456 admin; do
  code=$(curl -sS -m 8 -o /tmp/login_resp.json -w "%{http_code}" -X POST http://127.0.0.1:8090/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$p\"}")
  echo "pass=$p http=$code body=$(head -c 180 /tmp/login_resp.json)"
done
# also list users table
mysql -N website_java -e "SELECT id,username,LEFT(password_hash,20),role FROM sys_user LIMIT 5;" 2>&1 | head
mysql -N website_java -e "SHOW TABLES LIKE '%user%';" 