import subprocess
sql = """
SHOW COLUMNS FROM users;
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='website_java' ORDER BY 1;
"""
r = subprocess.run(['mysql','-uroot','website_java','-e', sql], capture_output=True, text=True)
print(r.stdout)
print(r.stderr)
print('code', r.returncode)
