import re
data = open("/tmp/ApiDocs.js", "r", encoding="utf-8", errors="ignore").read()
for m in re.finditer(r"`([\s\S]*?)`", data):
    t = m.group(1)
    if len(t) > 40:
        print("====")
        print(t[:1500])
        print()
