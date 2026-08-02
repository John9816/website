#!/usr/bin/env python3
import json, subprocess, urllib.request
key = subprocess.check_output(
    ["mysql", "-N", "website_java", "-e",
     "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey'"]
).decode().strip()
base = subprocess.check_output(
    ["mysql", "-N", "website_java", "-e",
     "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl'"]
).decode().strip()
print("base", base)
body = json.dumps({
    "model": "mimo-v2.5",
    "messages": [{"role": "user", "content": "reply with one word: ok"}],
    "max_tokens": 32,
    "stream": True,
}).encode()
req = urllib.request.Request(
    base + "/chat/completions",
    data=body,
    headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=90) as r:
    data = r.read(1200)
    print("status", r.status)
    print(data[:1200].decode("utf-8", "replace"))
