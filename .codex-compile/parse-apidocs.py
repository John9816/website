import re, json
from pathlib import Path
p = Path("/tmp/ApiDocs.js")
if not p.exists():
    import urllib.request
    urllib.request.urlretrieve("https://wisart.kuaileshifu.com/assets/ApiDocs-BPB-uO0Q.js", p)
data = p.read_text(encoding="utf-8", errors="ignore")
print("len", len(data))
# extract quoted strings carefully
strs = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', data)
print("strings", len(strs))
interesting = []
for s in strs:
    try:
        u = bytes(s, "utf-8").decode("unicode_escape")
    except Exception:
        u = s.replace("\\n", "\n").replace("\\t", "\t")
    if any(k in u for k in ["/v1", "Bearer", "image", "生成", "接口", "curl", "POST", "model", "OpenAI", "鉴权", "示例", "prompt", "http", "密钥", "Authorization", "size", "dall", "gpt"]):
        interesting.append(u)
# unique preserve order
seen=set(); out=[]
for u in interesting:
    if u not in seen:
        seen.add(u); out.append(u)
for u in out[:120]:
    print("----")
    print(u[:800])
print("PATHS", sorted(set(re.findall(r"https?://[A-Za-z0-9._:/-]+|/v1/[A-Za-z0-9_./-]+", data)))[:80])
# also search template literals
for m in re.finditer(r"`([^`]{20,400})`", data):
    t=m.group(1)
    if any(k in t for k in ["/v1","Bearer","images","生成","curl"]):
        print("TPL", t[:400])
