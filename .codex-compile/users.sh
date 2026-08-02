#!/bin/bash
mysql -N website_java -e "DESCRIBE users;"
mysql -N website_java -e "SELECT id, username, role, LEFT(password,40), enabled FROM users LIMIT 10;" 2>&1
mysql -N website_java -e "SELECT id, username, LEFT(password,60) FROM users LIMIT 10;" 2>&1
# check public-auth
cat /tmp/public-auth.json 2>/dev/null
# find tokens in files
grep -R "Bearer ey" /tmp 2>/dev/null | head -5
ls /root/*.json /opt/website*/*.json 2>/dev/null | head