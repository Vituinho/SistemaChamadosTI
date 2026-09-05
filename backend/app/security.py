import hashlib
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session as DBSession
from .database import get_db
from .models import Session, Technician, now, utc

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("dummy-password-for-timing-only")
COOKIE = "givova_session"


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def current_user(request: Request, db: DBSession = Depends(get_db, scope="function")):
    token = request.cookies.get(COOKIE)
    session = db.get(Session, digest(token)) if token else None
    if session is None or utc(session.expires_at) <= now():
        raise HTTPException(401, "Faça login para acessar a área da TI.")
    user = db.get(Technician, session.technician_id)
    if user is None:
        raise HTTPException(401, "Sessão inválida")
    return user
