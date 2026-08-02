#!/usr/bin/env bash
# Full path: pick top hot topic -> AI rewrite (with images) -> try WeChat draft
set -euo pipefail
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

echo "=== 1) hot topics ==="
curl -sS -m 90 -H "$AUTH" "$BASE/hot?limit=12&category=%E7%A7%91%E6%8A%80%20/%20%E4%BA%92%E8%81%94%E7%BD%91" -o /tmp/hot.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/hot.json'))
items=(d.get('data') or {}).get('items') or []
if not items:
    raise SystemExit('no hot topics')
# Prefer a concrete 信息差-friendly hot item (penalty / policy / platform news).
pick=items[0]
for prefer in ('携程', '罚', '垄断', '台风', '志愿'):
    for it in items:
        t=(it.get('title') or '')
        if prefer in t:
            pick=it
            break
    else:
        continue
    break
open('/tmp/pick.json','w').write(json.dumps(pick, ensure_ascii=False))
print('PICK:', (pick.get('title') or '')[:80])
print('source:', pick.get('sourceName') or pick.get('source'))
print('url:', (pick.get('url') or '')[:120])
PY

echo "=== 2) async generate (hot + cover/images + auto wechat draft) ==="
python3 - <<'PY'
import json
pick=json.load(open('/tmp/pick.json'))
body={
  "topic": pick.get("title") or "今日热点",
  "category": "科技 / 互联网",
  "angle": "信息差拆解：这件事对普通人意味着什么、怎么判断、怎么用",
  "audience": "关注科技与职场信息差的订阅号读者",
  "length": "standard",
  "imageMode": "fetch",
  "generateCover": True,
  "researchEnabled": True,
  "autoWechatDraft": True,
  "autoPublish": False,
  "topics": [pick],
  "coverStyle": "热点信息卡片，清晰醒目，适合订阅号首图",
}
open('/tmp/gen-body.json','w').write(json.dumps(body, ensure_ascii=False))
print(json.dumps(body, ensure_ascii=False)[:400])
PY

code=$(curl -sS -m 30 -o /tmp/gen-job.json -w '%{http_code}' \
  -X POST "$BASE/articles/generate-async" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  --data-binary @/tmp/gen-body.json)
echo "start code=$code"
cat /tmp/gen-job.json | head -c 500; echo
JOB=$(python3 - <<'PY'
import json
d=json.load(open('/tmp/gen-job.json'))
data=d.get('data') or {}
print(data.get('jobId') or data.get('id') or '')
PY
)
echo "jobId=$JOB"
if [[ -z "$JOB" ]]; then
  echo "no job id"; exit 1
fi

echo "=== 3) poll job ==="
for i in $(seq 1 90); do
  curl -sS -m 15 -H "$AUTH" "$BASE/automation/run/$JOB" -o /tmp/job.json || true
  python3 - <<'PY'
import json,sys
d=json.load(open('/tmp/job.json'))
data=d.get('data') or d
st=data.get('status') or data.get('state') or ''
stage=data.get('stage') or data.get('currentStage') or ''
msg=(data.get('message') or data.get('progressMessage') or '')[:120]
print(f"status={st} stage={stage} msg={msg}")
art=data.get('article') or data.get('result') or {}
if isinstance(art, dict) and art.get('id'):
    print('articleId', art.get('id'), 'score', art.get('qualityScore'), 'status', art.get('status'))
if st in ('SUCCEEDED','SUCCESS','DONE','FAILED','ERROR','COMPLETED'):
    open('/tmp/job-final.json','w').write(json.dumps(data, ensure_ascii=False))
    sys.exit(0)
sys.exit(2)
PY
  rc=$?
  if [[ $rc -eq 0 ]]; then
    break
  fi
  sleep 8
done

python3 - <<'PY'
import json
d=json.load(open('/tmp/job.json'))
print(json.dumps(d, ensure_ascii=False)[:2000])
data=d.get('data') or d
art=data.get('article') or data.get('result') or {}
aid=art.get('id') if isinstance(art, dict) else None
open('/tmp/aid.txt','w').write(str(aid or ''))
print('AID', aid)
PY
AID=$(cat /tmp/aid.txt)
if [[ -n "$AID" && "$AID" != "None" ]]; then
  echo "=== 4) article $AID ==="
  curl -sS -m 30 -H "$AUTH" "$BASE/articles/$AID" -o /tmp/art.json
  python3 - <<'PY'
import json
d=json.load(open('/tmp/art.json'))
a=(d.get('data') or {})
print('id', a.get('id'), 'status', a.get('status'), 'score', a.get('qualityScore'))
print('title', (a.get('title') or '')[:60])
print('imageMode', a.get('imageMode'))
print('cover', bool(a.get('coverImageUrl')), (a.get('coverImageUrl') or '')[:80])
imgs=a.get('inlineImages') or []
ready=sum(1 for i in imgs if (i or {}).get('status')=='READY' or (i or {}).get('ready') is True)
print('inline', len(imgs), 'ready~', ready)
print('wechatMediaId', a.get('wechatMediaId'))
print('err', (a.get('errorMessage') or '')[:200])
print('risks', (a.get('riskTips') or [])[:5])
PY
  if ! python3 - <<'PY'
import json
a=(json.load(open('/tmp/art.json')).get('data') or {})
raise SystemExit(0 if a.get('wechatMediaId') else 1)
PY
  then
    echo "=== 5) try wechat-draft ==="
    code=$(curl -sS -m 120 -o /tmp/wx.json -w '%{http_code}' \
      -X POST "$BASE/articles/$AID/wechat-draft" -H "$AUTH" -H 'Content-Type: application/json')
    echo "wechat code=$code"
    python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/wx.json')), ensure_ascii=False)[:1500])
PY
  fi
fi

mysql website_java -e "SELECT id,status,quality_score,image_mode,LEFT(title,40) t,LEFT(IFNULL(wechat_media_id,''),30) wx FROM content_article ORDER BY id DESC LIMIT 5;"
