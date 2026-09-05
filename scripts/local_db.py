"""Optional Windows-only PostgreSQL sandbox. Run from the repository root."""
import argparse
import ctypes
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / ".local"
BIN = LOCAL / "postgres/node_modules/@embedded-postgres/windows-x64/native/bin"


def short(path):
    buffer = ctypes.create_unicode_buffer(32768)
    if not ctypes.windll.kernel32.GetShortPathNameW(str(path), buffer, len(buffer)):
        raise SystemExit("Não foi possível obter o caminho curto do Windows.")
    return buffer.value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "start", "stop", "status"])
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("Este auxiliar é específico do Windows; use seu PostgreSQL local.")
    if not (BIN / "pg_ctl.exe").exists():
        raise SystemExit("Instale primeiro: npm install --prefix .local/postgres @embedded-postgres/windows-x64@18.4.0-beta.17 --ignore-scripts")
    if args.action == "init":
        if (LOCAL / "pgdata").exists() or (ROOT / "backend/.env").exists():
            raise SystemExit("Já existe banco ou .env. Nada foi sobrescrito; use start.")
        password = secrets.token_urlsafe(32)
        password_file = LOCAL / "db-password"
        password_file.write_text(password, encoding="utf-8")
        try:
            subprocess.run([short(BIN / "initdb.exe"), "-D", "pgdata", "-U", "givova_dev", "--pwfile", "db-password", "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"], cwd=short(LOCAL), check=True)
        finally:
            password_file.unlink(missing_ok=True)
        (ROOT / "backend/.env").write_text(f'DATABASE_URL=postgresql+psycopg://givova_dev:{password}@127.0.0.1:55432/givova_ti\nALLOWED_ORIGINS=["http://localhost:3000"]\nCOOKIE_SECURE=false\n', encoding="utf-8")
        print("Banco inicializado e credenciais gravadas apenas em backend/.env. Execute start.")
        return
    command = [short(BIN / "pg_ctl.exe"), "-D", "pgdata"]
    if args.action == "start":
        command += ["-l", "postgres.log", "-o", "-p 55432 -h 127.0.0.1", "-w", "start"]
    else:
        command += [args.action]
    subprocess.run(command, cwd=short(LOCAL), creationflags=subprocess.CREATE_NO_WINDOW, check=True)
    if args.action == "status":
        print("PostgreSQL local em execução em 127.0.0.1:55432.")
    elif args.action == "stop":
        print("PostgreSQL local encerrado.")
    if args.action == "start":
        os.chdir(ROOT / "backend")
        sys.path.insert(0, str(ROOT / "backend"))
        from app.config import settings
        from sqlalchemy.engine import make_url
        import psycopg
        url = make_url(settings.database_url)
        if url.host != "127.0.0.1" or url.port != 55432 or url.database != "givova_ti":
            raise SystemExit("Banco iniciado. .env aponta para outra conexão; nenhuma alteração nela foi feita.")
        with psycopg.connect(host=url.host, port=url.port, user=url.username, password=url.password, dbname="postgres", connect_timeout=5, autocommit=True) as db:
            if not db.execute("SELECT 1 FROM pg_database WHERE datname = 'givova_ti'").fetchone():
                db.execute("CREATE DATABASE givova_ti")
        print("PostgreSQL disponível em 127.0.0.1:55432. Execute as migrations antes da API.")


if __name__ == "__main__":
    main()
