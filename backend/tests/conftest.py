import os
import secrets
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app, attempts
from app.models import Technician
from app.security import passwords


@pytest.fixture
def db_factory(tmp_path):
    # A PostgreSQL URL is optional; use a unique schema, never drop existing tables.
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        schema = "test_" + secrets.token_hex(8)
        admin = create_engine(url)
        with admin.begin() as conn:
            conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add(Technician(username="test-tech", name="Técnico Teste", password_hash=passwords.hash("test-password-only")))
        db.commit()
    yield factory
    engine.dispose()
    if url:
        with admin.begin() as conn:
            conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin.dispose()


@pytest.fixture
def client(db_factory):
    def override():
        with db_factory() as db:
            yield db
    attempts.clear()
    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def logged(client):
    assert client.post("/auth/login", json={"username": "test-tech", "password": "test-password-only"}).status_code == 200
    return client


@pytest.fixture
def payload():
    return {"name": "Maria Teste", "department": "Financeiro", "category": "Impressora", "title": "Impressora não imprime", "description": "A impressão ficou parada na fila."}
