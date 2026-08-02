#!/usr/bin/env bash
set -uo pipefail
JOB="${1:?jobId required}"
SECRET_B64='G9JVnspxa0ONohqR2jhWgiSb/4jdDaW4mJUUUNWHO7fyZB3AwfJt5Kj81Q8vcajr'
TOKEN=$(python3 - <<PY
import base64, hmac, hashlib, json, time
secret = base64.b64decode("$SECRET_B64")
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
header = b64url(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",",":")).encode())
now = int(time.time())
payload = b64url(json.dumps({
  "sub":"1","username":"admin","role":"ADMIN","authVersion":0,
  "iat": now, "exp": now + 3600*12
}, separators=(",",":")).encode())
sig = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
print(f"{header}.{payload}.{b64url(sig)}")
PY
)
AUTH="Authorization: Bearer ${TOKEN}"
BASE=http://127.0.0.1:8090/api/admin/content
for i in $(seq 1 100); do
  curl -sS -m 20 -H "$AUTH" "$BASE/automation/run/$JOB" -o /tmp/job.json || true
  DONE=$(python3 - <<'PY'
import json
d=json.load(open('/tmp/job.json'))
data=d.get('data') or d
st=(data.get('status') or '').upper()
stage=data.get('stage') or ''
msg=(data.get('message') or data.get('stageLabel') or '')[:100]
err=(data.get('error') or data.get('errorMessage') or '')[:160]
art=data.get('article') or data.get('result') or {}
aid=art.get('id') if isinstance(art, dict) else None
score=art.get('qualityScore') if isinstance(art, dict) else None
ast=art.get('status') if isinstance(art, dict) else None
print(f"[{st}] stage={stage} msg={msg} art={aid} score={score} astatus={ast} err={err}")
if st in ('SUCCEEDED','SUCCESS','DONE','COMPLETED','FAILED','ERROR'):
    open('/tmp/job-final.json','w').write(json.dumps(data, ensure_ascii=False, indent=2))
    print('TERMINAL')
    if aid:
        open('/tmp/aid.txt','w').write(str(aid))
else:
    print('WAIT')
PY
)
  echo "$DONE"
  if echo "$DONE" | grep -q TERMINAL; then
    break
  fi
  sleep 8
done

if [[ -f /tmp/aid.txt ]]; then
  AID=$(cat /tmp/aid.txt)
  echo "=== article $AID ==="
  curl -sS -m 30 -H "$AUTH" "$BASE/articles/$AID" -o /tmp/art.json
  python3 - <<'PY'
import json
a=(json.load(open('/tmp/art.json')).get('data') or {})
print('id', a.get('id'), 'status', a.get('status'), 'score', a.get('qualityScore'))
print('title', (a.get('title') or '')[:70])
print('imageMode', a.get('imageMode'))
print('cover', bool(a.get('coverImageUrl')), (a.get('coverImageUrl') or '')[:100])
imgs=a.get('inlineImages') or []
print('inline count', len(imgs))
for i, im in enumerate(imgs[:5]):
    print(' ', i, (im or {}).get('status'), (im or {}).get('sourceType'), ((im or {}).get('sourceUrl') or (im or {}).get('url') or '')[:60])
print('wechatMediaId', a.get('wechatMediaId'))
print('err', (a.get('errorMessage') or '')[:250])
risks=a.get('riskTips') or []
print('risks:')
for r in risks[:8]:
    print(' -', str(r)[:140])
PY
  HAS_WX=$(python3 - <<'PY'
import json
a=(json.load(open('/tmp/art.json')).get('data') or {})
print('1' if a.get('wechatMediaId') else '0')
PY
)
  if [[ "$HAS_WX" == "0" ]]; then
    echo "=== try wechat-draft ==="
    code=$(curl -sS -m 180 -o /tmp/wx.json -w '%{http_code}' \
      -X POST "$BASE/articles/$AID/wechat-draft" -H "$AUTH" -H 'Content-Type: application/json' || true)
    echo "wechat code=$code"
    python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/wx.json')), ensure_ascii=False)[:1800])
PY
    curl -sS -m 30 -H "$AUTH" "$BASE/articles/$AID" -o /tmp/art.json
    python3 - <<'PY'
import json
a=(json.load(open('/tmp/art.json')).get('data') or {})
print('AFTER status', a.get('status'), 'wx', a.get('wechatMediaId'), 'err', (a.get('errorMessage') or '')[:200])
PY
  fi
fi
mysql website_java -e "SELECT id,status,quality_score,image_mode,LEFT(title,36) t,LEFT(IFNULL(wechat_media_id,''),24) wx FROM content_article ORDER BY id DESC LIMIT 6;"
