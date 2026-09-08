import asyncio
import io
import os
from concurrent.futures import ThreadPoolExecutor
import pytest
from PIL import Image
from sqlalchemy import select
from fastapi import HTTPException
from app import main
from app.models import Ticket, Technician, Session, now
from app.security import digest


def test_health_and_catalog(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/departments").json() == ["Faturamento", "Financeiro", "Logística", "Juridico", "Departamento Pessoal", "Monitoramento"]
    assert len(client.get("/catalog").json()["categories"]) == 10


def test_create_and_private_tracking(client, payload):
    response = client.post("/tickets", json=payload)
    assert response.status_code == 201
    ticket = response.json()
    assert ticket["protocol"].startswith("GV-") and ticket["priority"] == "NORMAL"
    assert ticket["status"] == "NOVO" and len(ticket["history"]) == 1
    assert "location" not in ticket
    from datetime import datetime
    assert abs((now() - datetime.fromisoformat(ticket["created_at"])).total_seconds()) < 10
    path = "/tracking/" + ticket["protocol"]
    assert client.get(path).status_code == 404
    assert client.get(path, headers={"X-Ticket-Key": "wrong"}).status_code == 404
    assert client.get(path, headers={"X-Ticket-Key": ticket["access_key"]}).json()["title"] == payload["title"]
    assert "access_hash" not in ticket


@pytest.mark.parametrize("change", [{"name": " "}, {"title": "x"}, {"department": "invalid"}, {"category": "invalid"}, {"priority": "URGENTE"}, {"description": "a" * 5001}, {"department": "Administrativo"}])
def test_validation(client, payload, change):
    assert client.post("/tickets", json={**payload, **change}).status_code == 422


@pytest.mark.parametrize("value", [None, "", "   ", "x"])
def test_optional_description(client, payload, value):
    response = client.post("/tickets", json={**payload, "description": value})
    assert response.status_code == 201
    assert response.json()["description"] == (value or "").strip()


@pytest.mark.parametrize("multipart", [False, True])
def test_omitted_description(client, payload, multipart):
    payload.pop("description")
    if multipart:
        response = client.post("/tickets", files={key: (None, value) for key, value in payload.items()})
    else:
        response = client.post("/tickets", json=payload)
    assert response.status_code == 201
    ticket = response.json()
    assert ticket["description"] == ""
    tracked = client.get("/tracking/" + ticket["protocol"], headers={"X-Ticket-Key": ticket["access_key"]})
    assert tracked.status_code == 200 and tracked.json()["description"] == ""


@pytest.mark.parametrize("path", ["/tickets", "/tickets/1", "/tickets/1/history", "/tickets/1/attachment", "/dashboard", "/events", "/auth/me"])
def test_private_reads(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path,method,data", [("/tickets/1/assign", "post", {}), ("/tickets/1/resolve", "post", {"solution": "Teste"}), ("/tickets/1", "patch", {"priority": "ALTA"})])
def test_private_writes(client, path, method, data):
    assert getattr(client, method)(path, json=data).status_code == 401


def test_full_lifecycle(logged, payload):
    ticket = logged.post("/tickets", json=payload).json()
    path = f'/tickets/{ticket["id"]}'
    assert logged.post(path + "/resolve", json={"solution": "Resolvido"}).status_code == 409
    assigned = logged.post(path + "/assign").json()
    assert assigned["technician"] == "Técnico Teste" and assigned["assigned_at"]
    assert assigned["status"] == "EM_ATENDIMENTO"
    assert logged.post(path + "/assign").status_code == 409
    assert logged.patch(path, json={"priority": "URGENTE", "status": "AGUARDANDO_USUARIO"}).status_code == 200
    assert logged.get("/dashboard").json()["pending"] == 1
    assert logged.patch(path, json={"status": "NOVO"}).status_code == 409
    assert logged.patch(path, json={"status": "RESOLVIDO"}).status_code == 409
    assert logged.post(path + "/resolve", json={"solution": " "}).status_code == 422
    resolved = logged.post(path + "/resolve", json={"solution": "Reiniciado spooler da impressora"}).json()
    assert resolved["status"] == "RESOLVIDO" and resolved["resolved_at"]
    assert len(resolved["history"]) == 5
    assert logged.patch(path, json={"priority": "BAIXA"}).status_code == 409
    assert logged.post(path + "/resolve", json={"solution": "Repetido"}).status_code == 409
    assert logged.get("/dashboard").json()["resolved_today"] == 1
    tracked = logged.get("/tracking/" + ticket["protocol"], headers={"X-Ticket-Key": ticket["access_key"]}).json()
    assert tracked["status"] == "RESOLVIDO" and tracked["solution"] == resolved["solution"]


def test_filter_search_pagination(logged, payload):
    first = logged.post("/tickets", json=payload).json()
    logged.post("/tickets", json={**payload, "title": "Internet lenta", "department": "Monitoramento"})
    assert logged.get("/tickets", params={"q": first["protocol"]}).json()["total"] == 1
    assert logged.get("/tickets", params={"q": "Maria"}).json()["total"] == 2
    assert logged.get("/tickets", params={"department": "Financeiro", "category": "Impressora", "status": "NOVO", "priority": "NORMAL"}).json()["total"] == 1
    assert logged.get("/tickets", params={"limit": 1, "offset": 1}).json()["items"][0]["title"] == "Internet lenta"
    assert logged.get("/tickets", params={"q": "%"}).json()["total"] == 0
    assert logged.get("/tickets?status=INVALID").status_code == 422


def test_auth_logout_csrf_and_expiry(client, db_factory):
    assert client.post("/auth/login", json={"username": "test-tech", "password": "wrong"}).status_code == 401
    response = client.post("/auth/login", json={"username": "test-tech", "password": "test-password-only"})
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200
    assert client.post("/auth/logout", headers={"Origin": "https://evil.example"}).status_code == 403
    token = client.cookies.get("givova_session")
    assert client.post("/auth/logout").status_code == 200
    client.cookies.set("givova_session", token)
    assert client.get("/auth/me").status_code == 401
    client.post("/auth/login", json={"username": "test-tech", "password": "test-password-only"})
    with db_factory() as db:
        session = db.scalar(select(Session))
        session.expires_at = now()
        db.commit()
    assert client.get("/auth/me").status_code == 401


def test_login_throttle(client):
    for _ in range(10):
        assert client.post("/auth/login", json={"username": "unknown", "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"username": "unknown", "password": "wrong"}).status_code == 429


def test_image_upload(logged, payload):
    data = io.BytesIO()
    Image.new("RGB", (20, 20), "orange").save(data, format="PNG")
    response = logged.post("/tickets", data=payload, files={"attachment": ("print.png", data.getvalue(), "image/png")})
    assert response.status_code == 201, response.text
    ticket = response.json()
    assert ticket["has_attachment"]
    image = logged.get(f'/tickets/{ticket["id"]}/attachment')
    assert image.headers["content-type"] == "image/webp"
    Image.open(io.BytesIO(image.content)).verify()
    assert logged.get(f'/tracking/{ticket["protocol"]}/attachment').status_code == 404
    assert logged.get(f'/tracking/{ticket["protocol"]}/attachment', headers={"X-Ticket-Key": ticket["access_key"]}).status_code == 200
    assert logged.post("/tickets", data=payload, files={"attachment": ("fake.png", b"<script>bad</script>", "image/png")}).status_code == 422
    assert logged.post("/tickets", data=payload, files={"attachment": ("big.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")}).status_code == 413


def test_cancel(logged, payload):
    ticket = logged.post("/tickets", json=payload).json()
    path = f'/tickets/{ticket["id"]}'
    assert logged.patch(path, json={"status": "CANCELADO"}).json()["status"] == "CANCELADO"
    assert logged.post(path + "/assign").status_code == 409


def test_sse_revision(client, payload, db_factory, monkeypatch):
    monkeypatch.setattr(main, "SessionLocal", db_factory)
    class Request:
        async def is_disconnected(self):
            return False
    async def run():
        stream = main.event_stream(Request())
        assert '"revision": 0' in await anext(stream)
        client.post("/tickets", json=payload)
        assert '"revision": 1' in await anext(stream)
        await stream.aclose()
    asyncio.run(run())


def test_timezone_preserves_instant():
    from datetime import datetime, timedelta, timezone
    value = datetime(2026, 9, 5, 8, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert main.stamp(value) == "2026-09-05T11:00:00+00:00"


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires PostgreSQL row locks")
def test_concurrent_assignment(client, payload, db_factory):
    ticket_id = client.post("/tickets", json=payload).json()["id"]
    def attempt():
        with db_factory() as db:
            user = db.scalar(select(Technician))
            try:
                main.assign(ticket_id, user, db)
                return 200
            except HTTPException as exc:
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: attempt(), range(2))) == [200, 409]
