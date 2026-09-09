from datetime import datetime, timezone
from sqlalchemy import ForeignKey, String, Text, DateTime, LargeBinary, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


class Technician(Base):
    __tablename__ = "technicians"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("technicians.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("technicians.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(2048), unique=True)
    p256dh: Mapped[str] = mapped_column(String(256))
    auth: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint("status IN ('NOVO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','AGUARDANDO_TERCEIRO','RESOLVIDO','CANCELADO')", name="ticket_status"),
        CheckConstraint("priority IN ('BAIXA','NORMAL','ALTA','URGENTE')", name="ticket_priority"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    access_hash: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="NOVO", index=True)
    priority: Mapped[str] = mapped_column(String(15), default="NORMAL")
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("technicians.id"))
    technician: Mapped[Technician | None] = relationship()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    solution: Mapped[str | None] = mapped_column(Text)
    history: Mapped[list["TicketHistory"]] = relationship(cascade="all, delete-orphan", order_by="TicketHistory.id")
    attachment: Mapped["Attachment | None"] = relationship(cascade="all, delete-orphan", uselist=False)


class TicketHistory(Base):
    __tablename__ = "ticket_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), unique=True)
    mime: Mapped[str] = mapped_column(String(40))
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
