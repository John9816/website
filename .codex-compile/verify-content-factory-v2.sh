#!/usr/bin/env bash
set -euo pipefail

USER_NAME="codex_verify_0718"
PASSWORD="CodexVerify0718!"
EMAIL="codex_verify_0718@751152.xyz"
BASE="http://127.0.0.1:8090"

cat > /tmp/codex-register.json <<JSON
{"username":"${USER_NAME}","password":"${PASSWORD}","email":"${EMAIL}"}
JSON

curl -s -X POST "${BASE}/api/auth/register" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @/tmp/codex-register.json >/tmp/codex-register-response.json || true

mysql website_java \
  -e "UPDATE users SET role='ADMIN' WHERE username='${USER_NAME}';"

curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @/tmp/codex-register.json >/tmp/codex-login-response.json

TOKEN="$(python3 - <<'PY'
import json
with open('/tmp/codex-login-response.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('data', {}).get('token', ''))
PY
)"

if [ -z "${TOKEN}" ]; then
  echo "LOGIN_FAILED"
  cat /tmp/codex-login-response.json
  exit 1
fi

echo "LOGIN_OK"
curl -s "${BASE}/api/admin/content/status" \
  -H "Authorization: Bearer ${TOKEN}" >/tmp/codex-content-status.json
python3 - <<'PY'
import json
with open('/tmp/codex-content-status.json', 'r', encoding='utf-8') as f:
    data = json.load(f).get('data', {})
print("STATUS_CONFIGS:%s" % json.dumps(data, ensure_ascii=False))
PY

cat > /tmp/codex-agent-run.json <<'JSON'
{
  "category": "科技 / 互联网",
  "topic": "AI 搜索结果开始重塑普通人获取信息的路径",
  "instruction": "生成一篇标准长度、带封面和 2-3 张正文配图的微信公众号文章。必须在通过质量门后创建微信草稿，不要自动群发。",
  "angle": "从搜索入口变化、内容平台分发、普通人的判断成本三个层面拆解信息差",
  "audience": "每天用搜索和信息流做决策的普通读者",
  "tone": "清醒、具体、像朋友解释复杂变化，不要学术腔",
  "length": "standard",
  "generateCover": true,
  "autoWechatDraft": true,
  "autoPublish": false
}
JSON

curl -s -X POST "${BASE}/api/admin/content/automation/run" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @/tmp/codex-agent-run.json >/tmp/codex-agent-start.json

JOB_ID="$(python3 - <<'PY'
import json
with open('/tmp/codex-agent-start.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('data', {}).get('jobId', ''))
PY
)"

if [ -z "${JOB_ID}" ]; then
  echo "JOB_START_FAILED"
  cat /tmp/codex-agent-start.json
  exit 1
fi

echo "JOB_ID:${JOB_ID}"
for i in $(seq 1 90); do
  curl -s "${BASE}/api/admin/content/automation/run/${JOB_ID}" \
    -H "Authorization: Bearer ${TOKEN}" >/tmp/codex-agent-job.json
  STATUS="$(python3 - <<'PY'
import json
with open('/tmp/codex-agent-job.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('data', {}).get('status', ''))
PY
)"
  echo "JOB_STATUS:${STATUS}"
  if [ "${STATUS}" = "SUCCESS" ] || [ "${STATUS}" = "FAILED" ]; then
    break
  fi
  sleep 10
done

python3 - <<'PY'
import json
with open('/tmp/codex-agent-job.json', 'r', encoding='utf-8') as f:
    data = json.load(f).get('data', {})
article = data.get('article') or {}
inline = article.get('inlineImages') or []
ready = [img for img in inline if img.get('status') == 'READY']
failed = [img for img in inline if img.get('status') == 'FAILED']
draft = data.get('draft') or {}
automation = data.get('automation') or {}
gate = automation.get('qualityGate')
print("ARTICLE_ID:%s" % article.get('id'))
print("ARTICLE_STATUS:%s" % article.get('status'))
print("TITLE:%s" % article.get('title'))
print("COVER:%s" % bool(article.get('coverImageUrl')))
print("COVER_URL:%s" % article.get('coverImageUrl'))
print("INLINE_TOTAL:%d READY:%d FAILED:%d" % (len(inline), len(ready), len(failed)))
for img in inline:
    print("INLINE:%s|%s|%s|%s|%s" % (
        img.get('slotId'), img.get('status'), img.get('sourceType'),
        img.get('sourcePageUrl'), img.get('failureReason')))
print("DRAFT_MODE:%s MEDIA_ID:%s" % (draft.get('mode'), draft.get('mediaId')))
print("QUALITY_GATE:%s" % json.dumps(gate, ensure_ascii=False))
print("ERROR:%s" % (data.get('errorMessage') or article.get('errorMessage')))
PY
