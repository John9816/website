"""Run on ECS as root. Use temporary identities; never log credentials/tokens."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def service_env(service):
    pid = subprocess.check_output(['systemctl', 'show', service, '-p', 'MainPID', '--value'], text=True).strip()
    assert pid.isdigit() and int(pid) > 0
    entries = Path('/proc', pid, 'environ').read_bytes().split(b'\0')
    return dict(item.decode().split('=', 1) for item in entries if b'=' in item)


backend = service_env('website-api')
frontend = service_env('website-ecs')
data_root = Path('/opt/website/shared/xuecheng')
assert frontend.get('EDITOR_DATA_DIR') == str(data_root)
assert int(frontend['EDITOR_MCP_UID']) > 0 and int(frontend['EDITOR_MCP_GID']) > 0
db_url = urllib.parse.urlsplit(backend['SPRING_DATASOURCE_URL'].removeprefix('jdbc:'))
db_name = db_url.path.lstrip('/')
assert re.fullmatch(r'[A-Za-z0-9_]+', db_name)
mysql_env = {**os.environ, 'MYSQL_PWD': backend['SPRING_DATASOURCE_PASSWORD']}
mysql_args = ['mysql', '--batch', '--raw', '--skip-column-names', '-h', db_url.hostname,
              '-P', str(db_url.port or 3306), '-u', backend['SPRING_DATASOURCE_USERNAME'], db_name]


def sql(statement):
    result = subprocess.run(mysql_args, input=statement, text=True, capture_output=True, env=mysql_env)
    if result.returncode:
        raise RuntimeError('Fixture database operation failed; credentials were not logged')
    return result.stdout.strip()


def token(uid, username):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    signing = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({
        'sub': str(uid), 'username': username, 'role': 'USER', 'authVersion': 0,
        'iat': int(time.time()), 'exp': int(time.time()) + 180,
    })
    signature = hmac.new(base64.b64decode(backend['JWT_SECRET']), signing, hashlib.sha256).digest()
    return (signing + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()


def request(path, method='GET', body=None, auth=None, expected=200):
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = 'Bearer ' + auth
    req = urllib.request.Request('https://hi.751152.xyz' + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    assert status == expected, f'{method} {path.split("/")[1:4]}: status {status}, expected {expected}'
    result = json.loads(raw)
    assert result['code'] == (0 if expected == 200 else expected)
    return result.get('data')


prefix = 'xuecheng_qa_' + secrets.token_hex(6)
names = [prefix + '_a', prefix + '_b']
users, docs, images = [], [], []
try:
    for name in names:
        uid = int(sql("INSERT INTO users (username,email,password_hash,role,enabled,auth_version,login_count,credits,created_at,updated_at) "
                      f"VALUES ('{name}','{name}@example.invalid','!temporary-smoke-fixture','USER',1,0,0,0,NOW(),NOW()); SELECT LAST_INSERT_ID();"))
        assert not (data_root / 'users' / str(uid)).exists()
        users.append((uid, token(uid, name)))
    a, b = users[0][1], users[1][1]
    request('/editor/api/docs', expected=401)
    assert request('/editor/api/docs', auth=a) == []
    content = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Production integration check'}]}]}
    doc = request('/editor/api/docs', 'POST', {'title': prefix, 'content': content}, a)
    docs.append((a, doc['id']))
    route = '/editor/api/docs/' + doc['id']
    assert request(route, auth=a)['content'] == content
    request(route, auth=b, expected=404)
    request(route, 'PUT', {'title': 'forbidden'}, b, expected=404)
    assert request('/editor/api/docs', auth=b) == []
    request(route, 'PUT', {'title': prefix + ' saved', 'content': content}, a)
    request(route, 'PATCH', {'favorite': True}, a)
    saved = request(route, auth=a)
    assert saved['title'].endswith(' saved') and saved['favorite']
    stored = json.loads((data_root / 'users' / str(users[0][0]) / 'docs.json').read_text())
    assert stored[0]['title'] == saved['title']
    template = request('/editor/api/templates', 'POST', {'name': prefix, 'content': content}, a)
    request('/editor/api/templates/' + template['id'], auth=b, expected=404)
    assert request('/editor/api/templates', auth=b) == []
    request('/editor/api/templates/' + template['id'], 'DELETE', auth=a)
    share = request(route + '/share', 'POST', auth=a)
    shared_path = '/editor/api/share/' + share['token']
    assert request(shared_path)['content'] == content
    request(route + '/share', 'DELETE', auth=a)
    request(shared_path, expected=404)
    request('/editor/api/mcp/servers', auth=a, expected=403)
    png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    upload = request('/editor/api/upload', 'POST', {'dataUrl': 'data:image/png;base64,' + png}, a)
    assert re.fullmatch(r'[a-f0-9]{48}\.png', upload['name'])
    images.append(data_root / 'files' / upload['name'])
    with urllib.request.urlopen('https://hi.751152.xyz' + upload['url'], timeout=10) as image:
        assert image.headers['Content-Type'] == 'image/png'
        assert image.read() == base64.b64decode(png)
    request(route, 'DELETE', auth=a)
    docs.clear()
    request(route, auth=a, expected=404)
    assert share['token'] not in json.loads((data_root / 'shares.json').read_text())
    print('PASS live HTTPS identity, CRUD, disk persistence, two-user isolation, templates, sharing/revocation, uploads and MCP access control')
finally:
    cleanup_errors = []
    for auth, doc_id in docs:
        try:
            request('/editor/api/docs/' + doc_id, 'DELETE', auth=auth)
        except Exception:
            cleanup_errors.append('temporary document cleanup failed')
    for uid, _ in users:
        shutil.rmtree(data_root / 'users' / str(uid), ignore_errors=True)
    for image in images:
        image.unlink(missing_ok=True)
    sql('DELETE FROM users WHERE username IN (' + ','.join("'" + name + "'" for name in names) + ');')
    assert sql('SELECT COUNT(*) FROM users WHERE username IN (' + ','.join("'" + name + "'" for name in names) + ');') == '0'
    assert not cleanup_errors, '; '.join(cleanup_errors)
    print('PASS temporary accounts, documents, templates and uploads removed')
