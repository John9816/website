import re
for name in ["/tmp/wisart-api.js", "/tmp/wisart-index.js"]:
    data = open(name, "r", encoding="utf-8", errors="ignore").read()
    print("===", name, "len", len(data))
    paths = sorted(set(re.findall(r"/v1/[A-Za-z0-9_./-]+", data)))
    print("paths:", paths[:100])
    for kw in ["images/generations", "api-docs", "Bearer", "OpenAI", "Authorization", "gpt-image", "dall-e", "flux", "chat/completions", "base_url", "api_key"]:
        print("has", kw, kw in data or kw.lower() in data.lower())
    cn = re.findall(r"[\u4e00-\u9fffA-Za-z0-9_./#:\-]{6,120}", data)
    keys = ["接口", "密钥", "模型", "生图", "请求", "示例", "鉴权", "文档", "图片", "生成", "Bearer", "OpenAI", "curl", "POST"]
    seen = set()
    print("interesting:")
    for s in cn:
        if any(k in s for k in keys) and s not in seen:
            seen.add(s)
            print(" -", s[:160])
            if len(seen) > 60:
                break
# also dump markdown-like chunks
for name in ["/tmp/wisart-api.js", "/tmp/wisart-index.js"]:
    data = open(name, "r", encoding="utf-8", errors="ignore").read()
    for m in re.finditer(r"(api-docs|API文档|接入|images/generations|Authorization: Bearer)[^\"']{0,200}", data, re.I):
        print("ctx:", m.group(0)[:220])
