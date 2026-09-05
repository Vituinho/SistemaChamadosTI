import os
import secrets
import subprocess
import sys
from urllib.parse import quote
from sqlalchemy import create_engine


def test_migration_round_trip(tmp_path):
    """Exercise upgrade/downgrade/upgrade in a disposable schema or file."""
    url = os.environ.get("TEST_DATABASE_URL")
    admin = None
    if url:
        schema = "migration_" + secrets.token_hex(8)
        admin = create_engine(url)
        with admin.begin() as conn:
            conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        url += ("&" if "?" in url else "?") + "options=" + quote(f"-csearch_path={schema}")
    else:
        url = "sqlite:///" + (tmp_path / "migrations.db").as_posix()
    env = {**os.environ, "DATABASE_URL": url}
    try:
        for command in [("upgrade", "head"), ("check",), ("downgrade", "base"), ("upgrade", "head"), ("check",)]:
            result = subprocess.run([sys.executable, "-m", "alembic", *command], env=env, capture_output=True, text=True, timeout=30)
            assert result.returncode == 0, result.stderr
    finally:
        if admin:
            with admin.begin() as conn:
                conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
            admin.dispose()
