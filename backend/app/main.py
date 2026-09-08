import asyncio
import io
import json
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Depends, HTTPException, Request, Response, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import select, func, text, delete
from sqlalchemy.orm import Session as DBSession
from starlette.datastructures import UploadFile
from starlette.concurrency import run_in_threadpool

from .catalog import DEPARTMENTS, CATEGORIES, STATUSES, PRIORITIES, TRANSITIONS
from .config import settings
from .database import get_db, SessionLocal
from .models import Ticket, TicketHistory, Attachment, Technician, Session, now, utc
from .schemas import TicketCreate, TicketUpdate, Resolution, Login, Status, Priority
from .security import COOKIE, digest, passwords, DUMMY_HASH, current_user

app = FastAPI(title="Givova TI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                   allow_credentials=True, allow_methods=["GET", "POST", "PATCH"],
                   allow_headers=["Content-Type", "X-Ticket-Key"])


class BodyLimitMiddleware:
    """Limit streamed bodies as well as requests with Content-Length."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        total = 0

        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > 6 * 1024 * 1024:
                raise HTTPException(413, "A requisição excede 6 MB.")
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(BodyLimitMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PATCH", "DELETE", "PUT"} and origin and origin not in settings.allowed_origins:
        return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse({"detail": "Confira os campos e seus limites.", "fields": [".".join(map(str, e["loc"])) for e in exc.errors()]}, status_code=422)


@app.get("/health")
def health(db: DBSession = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(503, "Banco de dados indisponível")
    return {"status": "ok", "system": "Givova TI"}


@app.get("/departments")
def departments():
    return DEPARTMENTS


@app.get("/catalog")
def catalog():
    return {"departments": DEPARTMENTS, "categories": CATEGORIES, "statuses": STATUSES, "priorities": PRIORITIES}


# Bounded, process-local protection for the internal V1. Use one worker by default.
attempts: dict[str, deque] = defaultdict(deque)


def limit_login(key):
    cutoff = time.monotonic() - 300
    for expired in list(attempts):
        while attempts[expired] and attempts[expired][0] < cutoff:
            attempts[expired].popleft()
        if not attempts[expired]:
            del attempts[expired]
    if len(attempts) >= 10000 or len(attempts[key]) >= 10:
        raise HTTPException(429, "Muitas tentativas. Aguarde cinco minutos.")
    attempts[key].append(time.monotonic())


@app.post("/auth/login")
def login(data: Login, request: Request, response: Response, db: DBSession = Depends(get_db)):
    limit_login(request.client.host if request.client else "unknown")
    user = db.scalar(select(Technician).where(Technician.username == data.username.lower().strip()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Usuário ou senha inválidos")
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(Session).where(Session.token_hash == digest(old)))
    db.execute(delete(Session).where(Session.expires_at < now()))
    token = secrets.token_urlsafe(32)
    db.add(Session(token_hash=digest(token), technician_id=user.id, expires_at=now() + timedelta(hours=settings.session_hours)))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=settings.cookie_secure, samesite="strict", max_age=settings.session_hours * 3600, path="/")
    return {"id": user.id, "name": user.name}


@app.get("/auth/me")
def me(user: Technician = Depends(current_user)):
    return {"id": user.id, "name": user.name}


@app.post("/auth/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    db.execute(delete(Session).where(Session.token_hash == digest(request.cookies.get(COOKIE, ""))))
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


def stamp(value):
    return utc(value).isoformat() if value else None


def ticket_data(ticket, detail=False):
    data = {key: getattr(ticket, key) for key in ["id", "name", "department", "category", "title", "status", "priority"]}
    data.update(protocol=f"GV-{ticket.id:06d}", technician=ticket.technician.name if ticket.technician else None,
                created_at=stamp(ticket.created_at), assigned_at=stamp(ticket.assigned_at), resolved_at=stamp(ticket.resolved_at))
    if detail:
        data.update(description=ticket.description, solution=ticket.solution,
                    has_attachment=ticket.attachment is not None,
                    history=[{"id": h.id, "message": h.message, "created_at": stamp(h.created_at)} for h in ticket.history])
    return data


def ticket_by_id(db, ticket_id, lock=False):
    stmt = select(Ticket).where(Ticket.id == ticket_id)
    if lock:
        stmt = stmt.with_for_update()
    ticket = db.scalar(stmt)
    if ticket is None:
        raise HTTPException(404, "Chamado não encontrado")
    return ticket


def record(db, ticket, message):
    db.add(TicketHistory(ticket_id=ticket.id, message=message))


def validate_image(raw):
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "A imagem deve ter até 5 MB.")
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format not in {"PNG", "JPEG", "WEBP"} or img.width * img.height > 16_000_000:
                raise ValueError()
            img.verify()
        with Image.open(io.BytesIO(raw)) as img:
            # Re-encode pixels to discard metadata and trailing payloads.
            clean = img.convert("RGB")
            output = io.BytesIO()
            clean.save(output, format="WEBP", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Envie uma imagem PNG, JPG ou WEBP válida, de até 16 megapixels.")


@app.post("/tickets", status_code=201)
async def create_ticket(request: Request, db: DBSession = Depends(get_db)):
    attachment = None
    try:
        if request.headers.get("content-type", "").startswith("multipart/form-data"):
            async with request.form(max_files=1, max_fields=5) as form:
                fields = dict(form)
                upload = fields.pop("attachment", None)
                if isinstance(upload, UploadFile) and upload.filename:
                    attachment = validate_image(await upload.read(5 * 1024 * 1024 + 1))
                elif upload is not None and not isinstance(upload, UploadFile):
                    raise HTTPException(422, "Anexo inválido")
                data = TicketCreate.model_validate(fields)
        else:
            data = TicketCreate.model_validate(await request.json())
    except (ValidationError, json.JSONDecodeError):
        raise HTTPException(422, "Confira os campos obrigatórios, setores, categorias e limites de tamanho.")
    key = secrets.token_urlsafe(32)
    ticket = Ticket(**data.model_dump(), access_hash=digest(key))
    db.add(ticket)
    db.flush()
    record(db, ticket, "Chamado criado — aguardando TI")
    if attachment:
        db.add(Attachment(ticket_id=ticket.id, mime="image/webp", data=attachment))
    db.commit()
    return {**ticket_data(ticket, True), "access_key": key}


@app.get("/tickets")
def list_tickets(status: Status | None = None, department: str | None = None,
                 category: str | None = None, priority: Priority | None = None,
                 q: str = Query("", max_length=160), offset: int = Query(0, ge=0),
                 limit: int = Query(50, ge=1, le=100),
                 user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    stmt = select(Ticket)
    for field, value in [("status", status), ("department", department), ("category", category), ("priority", priority)]:
        if value:
            stmt = stmt.where(getattr(Ticket, field) == value)
    if q.strip():
        term = q.strip().lstrip("#").upper().removeprefix("GV-")
        match = Ticket.name.icontains(q.strip(), autoescape=True) | Ticket.title.icontains(q.strip(), autoescape=True)
        if term.isdigit() and len(term) < 12:
            match = match | (Ticket.id == int(term))
        stmt = stmt.where(match)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    tickets = db.scalars(stmt.order_by(Ticket.created_at, Ticket.id).offset(offset).limit(limit)).all()
    return {"items": [ticket_data(t) for t in tickets], "total": total}


@app.get("/dashboard")
def dashboard(user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    counts = dict(db.execute(select(Ticket.status, func.count()).group_by(Ticket.status)).all())
    local = datetime.now(ZoneInfo(settings.timezone))
    start = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    resolved = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.resolved_at >= start, Ticket.status == "RESOLVIDO"))
    latest = db.scalar(select(func.max(Ticket.id))) or 0
    return {"new": counts.get("NOVO", 0), "active": counts.get("EM_ATENDIMENTO", 0),
            "pending": counts.get("AGUARDANDO_USUARIO", 0) + counts.get("AGUARDANDO_TERCEIRO", 0), "resolved_today": resolved, "latest_id": latest}


@app.get("/tickets/{ticket_id}")
def detail(ticket_id: int, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    return ticket_data(ticket_by_id(db, ticket_id), True)


@app.get("/tickets/{ticket_id}/history")
def history(ticket_id: int, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    return ticket_data(ticket_by_id(db, ticket_id), True)["history"]


@app.post("/tickets/{ticket_id}/assign")
def assign(ticket_id: int, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    ticket = ticket_by_id(db, ticket_id, True)
    if ticket.status != "NOVO" or ticket.technician_id is not None:
        raise HTTPException(409, "Este chamado já foi assumido ou encerrado.")
    ticket.technician_id, ticket.assigned_at, ticket.status = user.id, now(), "EM_ATENDIMENTO"
    record(db, ticket, f"{user.name} assumiu o chamado — status EM_ATENDIMENTO")
    db.commit()
    db.refresh(ticket)
    return ticket_data(ticket, True)


@app.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, data: TicketUpdate, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    ticket = ticket_by_id(db, ticket_id, True)
    if ticket.status in {"RESOLVIDO", "CANCELADO"}:
        raise HTTPException(409, "Chamados encerrados não podem ser alterados.")
    if data.status and data.status != ticket.status:
        if data.status not in TRANSITIONS[ticket.status]:
            raise HTTPException(409, "Transição inválida. Use assumir ou resolver quando apropriado.")
        record(db, ticket, f"{user.name}: status {ticket.status} → {data.status}")
        ticket.status = data.status
    if data.priority and data.priority != ticket.priority:
        record(db, ticket, f"{user.name}: prioridade {ticket.priority} → {data.priority}")
        ticket.priority = data.priority
    db.commit()
    db.refresh(ticket)
    return ticket_data(ticket, True)


@app.post("/tickets/{ticket_id}/resolve")
def resolve(ticket_id: int, data: Resolution, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    ticket = ticket_by_id(db, ticket_id, True)
    if ticket.status not in {"EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO"}:
        raise HTTPException(409, "Assuma o chamado antes de resolver; chamados encerrados não podem ser resolvidos novamente.")
    ticket.status, ticket.resolved_at, ticket.solution = "RESOLVIDO", now(), data.solution
    record(db, ticket, f"{user.name} resolveu o chamado — {data.solution}")
    db.commit()
    db.refresh(ticket)
    return ticket_data(ticket, True)


def public_ticket(db, protocol, key):
    if not protocol.startswith("GV-") or not protocol[3:].isdigit() or len(protocol) > 15:
        raise HTTPException(404, "Chamado não encontrado")
    ticket = db.scalar(select(Ticket).where(Ticket.id == int(protocol[3:])))
    if not ticket or not key or not secrets.compare_digest(ticket.access_hash, digest(key)):
        raise HTTPException(404, "Chamado não encontrado ou link inválido")
    return ticket


@app.get("/tracking/{protocol}")
def tracking(protocol: str, request: Request, db: DBSession = Depends(get_db)):
    return ticket_data(public_ticket(db, protocol, request.headers.get("x-ticket-key")), True)


@app.get("/tickets/{ticket_id}/attachment")
def attachment(ticket_id: int, user: Technician = Depends(current_user), db: DBSession = Depends(get_db)):
    return image_response(db, ticket_id)


def image_response(db, ticket_id):
    attachment = db.scalar(select(Attachment).where(Attachment.ticket_id == ticket_id))
    if attachment is None:
        raise HTTPException(404, "Sem anexo")
    return Response(attachment.data, media_type=attachment.mime, headers={"Content-Disposition": 'inline; filename="anexo.webp"'})


@app.get("/tracking/{protocol}/attachment")
def public_attachment(protocol: str, request: Request, db: DBSession = Depends(get_db)):
    ticket = public_ticket(db, protocol, request.headers.get("x-ticket-key"))
    return image_response(db, ticket.id)


def event_revision(session_hash=None, ticket_id=None):
    # SQLAlchemy uses synchronous I/O; open and close the session in the worker.
    with SessionLocal() as db:
        if session_hash:
            session = db.get(Session, session_hash)
            if not session or utc(session.expires_at) <= now():
                return None
        stmt = select(func.max(TicketHistory.id))
        if ticket_id:
            stmt = stmt.where(TicketHistory.ticket_id == ticket_id)
        return db.scalar(stmt) or 0


async def event_stream(request, session_hash=None, ticket_id=None):
    previous = None
    # Each poll opens a short DB session, so streams never occupy a pool connection.
    while not await request.is_disconnected():
        revision = await run_in_threadpool(event_revision, session_hash, ticket_id)
        if revision is None:
            yield 'event: expired\ndata: {}\n\n'
            return
        if revision != previous:
            yield f'event: update\ndata: {json.dumps({"revision": revision})}\n\n'
            previous = revision
        else:
            yield ': keepalive\n\n'
        await asyncio.sleep(2)


@app.get("/events")
def events(request: Request, user: Technician = Depends(current_user)):
    return StreamingResponse(event_stream(request, session_hash=digest(request.cookies[COOKIE])), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


@app.get("/tracking/{protocol}/events")
def tracking_events(protocol: str, request: Request, db: DBSession = Depends(get_db, scope="function")):
    ticket = public_ticket(db, protocol, request.headers.get("x-ticket-key"))
    return StreamingResponse(event_stream(request, ticket_id=ticket.id), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})
