#!/bin/bash
systemctl status website-java-api --no-pager -l | head -40
journalctl -u website-java-api -n 40 --no-pager
ss -lntp | grep -E '8090|3000|18787' || true
ls -la /opt/website-java-api/website.jar
# if not running start
systemctl start website-java-api
sleep 8
systemctl is-active website-java-api
ss -lntp | grep 8090 || true
curl -sS -m 10 -o /tmp/logintry.json -w "login=%{http_code}\n" -X POST http://127.0.0.1:8090/api/auth/login -H "Content-Type: application/json" -d '{"username":"codex_verify_0718","password":"CodexVerify0718!"}' || true
head -c 200 /tmp/logintry.json; echo