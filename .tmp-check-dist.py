from pathlib import Path
root = Path("/opt/website/dist/assets")
for p in sorted(root.glob("*.js")):
    t = p.read_text(encoding="utf-8", errors="ignore")
    flags = []
    for k in ["确认删除用户", "不能删除当前", "admin/users", "DELETE", "reset-password"]:
        if k in t:
            flags.append(k)
    if flags and ("admin/users" in t or "确认删除" in t or "AdminUsers" in p.name or p.name.startswith("admin")):
        print(p.name, flags, "size", p.stat().st_size)
print("--- AdminUsers files ---")
for p in root.glob("*dmin*"):
    print(p.name, p.stat().st_size)
