"""Validate the production ZIP on portable local Apache/PHP and disposable FastAPI.

Requires .local/apache/Apache24, .local/php (with cacert.pem),
.local/cpanel-test/node_modules/playwright, installed Chrome, and backend dependencies.
Only GET requests reach Render. All writes use an in-memory local SQLite fixture.
"""
import ctypes, io, json, os, shutil, ssl, subprocess, sys, time, zipfile
from pathlib import Path
import httpx
from PIL import Image

root = Path(__file__).resolve().parents[1]
work = root / '.local' / 'cpanel-validation'
work.mkdir(exist_ok=True)
site = work / 'site'
site.mkdir(exist_ok=True)
with zipfile.ZipFile(root / 'dist/cpanel-givova-chamados.zip') as z:
    z.extractall(site)
apache = root / '.local/apache/Apache24'
php = root / '.local/php'
def path(p):
    buffer = ctypes.create_unicode_buffer(4096)
    ctypes.windll.kernel32.GetShortPathNameW(str(p), buffer, 4096)
    return (buffer.value or str(p)).replace('\\', '/')
cert, key = work / 'cert.pem', work / 'key.pem'
subprocess.run([str(apache/'bin/openssl.exe'), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', str(key), '-out', str(cert), '-config', str(apache/'conf/openssl.cnf')], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ca = work / 'ca.pem'
ca.write_bytes((php/'cacert.pem').read_bytes() + b'\n' + cert.read_bytes())
ini = work / 'php.ini'
ini.write_text(f'extension_dir="{path(php / "ext")}"\nextension=curl\ncurl.cainfo="{path(ca)}"\ncgi.force_redirect=0\nupload_tmp_dir="{path(work)}"\nupload_max_filesize=5M\npost_max_size=6M\ndisplay_errors=Off\nlog_errors=On\n', encoding='utf-8')
config = work / 'httpd.conf'
modules = ['authz_core', 'authz_host', 'access_compat', 'mime', 'dir', 'rewrite', 'headers', 'log_config', 'env', 'alias', 'actions', 'cgi', 'ssl', 'socache_shmcb']
config.write_text(f'ServerRoot "{path(apache)}"\nServerName localhost\nListen 127.0.0.1:9080\nListen 127.0.0.1:9443\n' + ''.join(f'LoadModule {m}_module modules/mod_{m}.so\n' for m in modules) + f'''
ErrorLog "{path(work / 'apache-error.log')}"
LogLevel warn
TypesConfig "{path(apache / 'conf/mime.types')}"
DocumentRoot "{path(site)}"
<Directory "{path(site)}">
AllowOverride All
Require all granted
</Directory>
ScriptAlias /php-cgi/ "{path(php)}/"
<Directory "{path(php)}">
Options +ExecCGI
Require all granted
</Directory>
SetEnv PHPRC "{path(ini)}"
Action application/x-httpd-php /php-cgi/php-cgi.exe
AddHandler application/x-httpd-php .php
<VirtualHost 127.0.0.1:9443>
SSLEngine on
SSLCertificateFile "{path(cert)}"
SSLCertificateKeyFile "{path(key)}"
</VirtualHost>
''', encoding='utf-8')
subprocess.run([str(apache/'bin/httpd.exe'), '-t', '-f', str(config)], check=True)
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
log = open(work/'processes.log', 'w')
server = subprocess.Popen([str(apache/'bin/httpd.exe'), '-f', str(config)], stdout=log, stderr=log, creationflags=flags)
api_server = None
checks = []
def check(condition, label):
    assert condition, label
    checks.append(label)
    print('PASS', label, flush=True)
try:
    client = httpx.Client(base_url='https://localhost:9443', verify=str(cert), timeout=25, trust_env=False)
    for _ in range(30):
        try:
            if client.get('/').status_code == 200: break
        except httpx.HTTPError: pass
        time.sleep(.3)
    for route in ['/', '/chamado/', '/ti/', '/tutorial/', '/acompanhar/?protocol=GV-000001']:
        check(client.get(route).status_code == 200, 'static ' + route)
    r = httpx.get('http://localhost:9080/chamado/', follow_redirects=False, trust_env=False)
    check(r.status_code == 301 and r.headers['location'].startswith('https://'), 'HTTPS redirect')
    r = client.get('/chamado/GV-123456')
    check(r.status_code == 302 and r.headers['location'].endswith('/acompanhar/?protocol=GV-123456'), 'legacy tracking redirect')
    check(client.get('/painel').headers['location'].endswith('/ti/'), 'panel redirect')
    for route in ['/api/config.php', '/.user.ini', '/.htaccess']:
        check(client.get(route).status_code == 403, 'blocked ' + route)
    check(client.get('/missing').status_code == 404, 'real 404')
    r = client.get('/api/health')
    check(r.status_code == 200 and r.json()['status'] == 'ok', 'PHP proxy to Render health')
    check(client.get('/api/catalog').status_code == 200, 'PHP proxy to Render catalog')
    check(client.get('/api/auth/me').status_code == 401, 'Render denies unauthenticated session')
    check(client.get('/api/events').status_code == 404, 'SSE disabled')
    check(client.get('/api/https://example.com').status_code in {400,403,404}, 'arbitrary URL rejected')
    check(client.post('/api/auth/login', headers={'Origin':'https://evil.invalid'}, json={}).status_code == 403, 'cross-origin write rejected before Render')
    check(client.post('/api/auth/login', json={}).status_code == 403, 'write without origin rejected')
    # The isolated copy alone targets a local TLS FastAPI fixture. Production remains fixed to Render.
    proxy = site / 'api/index.php'
    proxy.write_text(proxy.read_text(encoding='utf-8').replace('https://[a-z0-9-]+\\.onrender\\.com', 'https://localhost:9444'), encoding='utf-8')
    (site/'api/config.php').write_text("<?php return ['backend_url'=>'https://localhost:9444'];", encoding='utf-8')
    fixture = work/'fixture.py'
    fixture.write_text('''import sys
sys.path.insert(0, sys.argv[1])
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.models import Technician
from app.security import passwords
from app.config import settings
engine=create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
factory=sessionmaker(bind=engine)
with factory() as db:
    db.add(Technician(username='cpanel-test', name='Teste cPanel', password_hash=passwords.hash('cpanel-test-password')))
    db.commit()
def override():
    with factory() as db: yield db
app.dependency_overrides[get_db]=override
settings.cookie_secure=True
import uvicorn
uvicorn.run(app, host='127.0.0.1', port=9444, ssl_certfile=sys.argv[2], ssl_keyfile=sys.argv[3])
''', encoding='utf-8')
    api_server = subprocess.Popen([sys.executable, str(fixture), str(root/'backend'), str(cert), str(key)], stdout=log, stderr=log, creationflags=flags)
    for _ in range(30):
        if client.get('/api/health').status_code == 200: break
        time.sleep(.3)
    origin={'Origin':'https://localhost:9443'}
    r=client.post('/api/auth/login', headers=origin, json={'username':'cpanel-test','password':'cpanel-test-password'})
    check(r.status_code==200, 'login via PHP to isolated FastAPI')
    cookie=r.headers['set-cookie'].lower()
    check(all(x in cookie for x in ['httponly','secure','samesite=strict','path=/']) and 'domain=' not in cookie, 'host-only secure HttpOnly Strict cookie')
    check(client.get('/api/auth/me').status_code==200, 'cookie forwarded to protected endpoint')
    payload={'name':'Teste cPanel','department':'Financeiro','state':'SP','location':'Sala de teste','category':'Sistema','affected_system':'DBFrete','title':'Teste local de upload','description':'Validação descartável'}
    image=io.BytesIO()
    Image.new('RGB',(20,20),'orange').save(image,format='PNG')
    r=client.post('/api/tickets',headers=origin,data=payload,files={'attachment':('teste.png',image.getvalue(),'image/png')})
    if r.status_code!=201: print('UPLOAD ERROR',r.status_code,r.text,flush=True)
    check(r.status_code==201,'multipart attachment and DBFrete preserved')
    ticket=r.json()
    (work/'ticket.json').write_text(json.dumps(ticket),encoding='utf-8')
    access={'X-Ticket-Key':ticket['access_key']}
    track='/api/tracking/'+ticket['protocol']
    check(client.get(track).status_code==404,'tracking key required')
    check(client.get(track,headers=access).status_code==200,'tracking with private header')
    r=client.get(track+'/attachment',headers=access)
    check(r.status_code==200 and r.headers['content-type']=='image/webp','binary attachment returned')
    tid=str(ticket['id'])
    check(client.get('/api/dashboard').status_code==200,'protected dashboard')
    check(client.get('/api/tickets?q=teste&affected_system=DBFrete').json()['total']==1,'search and filters forwarded')
    check(client.post('/api/tickets/'+tid+'/assign',headers=origin).status_code==200,'assign ticket')
    check(client.patch('/api/tickets/'+tid,headers=origin,json={'priority':'ALTA','status':'AGUARDANDO_USUARIO'}).status_code==200,'PATCH status and priority')
    check(client.post('/api/tickets/'+tid+'/resolve',headers=origin,json={'solution':'Problema resolvido no teste local.'}).status_code==200,'resolve ticket')
    check(client.get(track,headers=access).json()['status']=='RESOLVIDO','polling reads persisted resolution')
    check(len(client.get('/api/tickets/'+tid+'/history').json())>=4,'history preserved')
    r=client.post('/api/tickets',headers=origin,data=payload,files={'attachment':('bad.png',b'not an image','image/png')})
    check(r.status_code==422,'invalid image rejected by FastAPI')
    r=client.post('/api/tickets',headers=origin,data=payload,files={'attachment':('big.png',b'x'*(5*1024*1024+1),'image/png')})
    check(r.status_code==413,'oversized image rejected by PHP')
    # Browser QA uses only the disposable fixture; no production data is changed.
    subprocess.run(['node',str(root/'scripts/test_cpanel_browser.cjs')],check=True,cwd=root)
    r=client.post('/api/auth/logout',headers=origin)
    check(r.status_code==200 and 'max-age=0' in r.headers['set-cookie'].lower(),'logout cookie cleared')
    check(client.get('/api/auth/me').status_code==401,'session revoked after logout')
    (work/'results.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
finally:
    server.terminate()
    if api_server: api_server.terminate()
    server.wait(timeout=15)
    if api_server: api_server.wait(timeout=15)
    log.close()
