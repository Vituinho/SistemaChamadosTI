"""Build and package only the static production site and cPanel PHP proxy."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'givova-ti-frontend'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-build', action='store_true', help='Package a previously verified CPANEL_EXPORT=1 build')
    args = parser.parse_args()
    if not args.skip_build:
        subprocess.run([shutil.which('npm.cmd' if os.name == 'nt' else 'npm'), 'run', 'build'],
                       cwd=FRONTEND, env={**os.environ, 'CPANEL_EXPORT': '1'}, check=True)
    out = FRONTEND / 'out'
    config = json.loads((FRONTEND / '.next' / 'required-server-files.json').read_text(encoding='utf-8'))['config']
    if config.get('output') != 'export' or config.get('env', {}).get('NEXT_PUBLIC_API_URL') != '/api':
        raise RuntimeError('The last production build must be CPANEL_EXPORT=1 with same-origin /api')
    for route in ['', 'chamado', 'acompanhar', 'ti', 'painel', 'tutorial']:
        if not (out / route / 'index.html').is_file():
            raise RuntimeError(f'Missing static route: {route}')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    target = dist / 'cpanel-givova-chamados.zip'
    files = {p.relative_to(out).as_posix(): p for p in out.rglob('*') if p.is_file()}
    deploy = ROOT / 'deploy' / 'cpanel'
    files.update({p.relative_to(deploy).as_posix(): p for p in deploy.rglob('*') if p.is_file()})
    for name in files:
        if any(part in {'node_modules', '.git', '.venv'} for part in Path(name).parts) or Path(name).suffix in {'.map', '.py', '.ts', '.tsx', '.pem', '.key'} or Path(name).name.startswith('.env'):
            raise RuntimeError(f'Unexpected production file: {name}')
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sorted(files.items()):
            archive.write(path, name)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert {'index.html', '.htaccess', 'api/index.php', 'api/config.php', 'acompanhar/index.html', 'push-sw.js', 'tutorial.mp4'} <= set(archive.namelist())
    print(f'{target}\n{target.stat().st_size} bytes; {len(files)} files')


if __name__ == '__main__':
    main()
