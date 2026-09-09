"""Send new-ticket notifications through standards-based Web Push."""
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select

from .config import settings
from .database import SessionLocal
from .models import PushSubscription, Ticket


logger = logging.getLogger(__name__)


def configured():
    return bool(settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject)


def _deliver(db, subscriptions, message):
    payload = json.dumps(message, ensure_ascii=False)
    stale = []
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=3600,
                timeout=10,
            )
        except WebPushException as exc:
            if exc.status_code in {404, 410}:
                stale.append(subscription.id)
            else:
                logger.warning("Falha temporária ao enviar Web Push: status=%s", exc.status_code)
        except Exception:
            logger.exception("Falha inesperada ao enviar Web Push")
    if stale:
        db.execute(delete(PushSubscription).where(PushSubscription.id.in_(stale)))
        db.commit()


def send_new_ticket(ticket_id: int):
    if not configured():
        return
    with SessionLocal() as db:
        ticket = db.get(Ticket, ticket_id)
        if ticket is None:
            return
        _deliver(db, db.scalars(select(PushSubscription)).all(), {
            "title": f"Novo chamado — {ticket.department}",
            "body": f"{ticket.name}: {ticket.title}",
            "url": f"/ti?ticket={ticket.id}",
            "tag": f"ticket-{ticket.id}",
        })


def send_test_notification(technician_id: int):
    if not configured():
        return
    with SessionLocal() as db:
        subscriptions = db.scalars(select(PushSubscription).where(
            PushSubscription.technician_id == technician_id
        )).all()
        _deliver(db, subscriptions, {
            "title": "Notificações ativadas — Givova TI",
            "body": "Este computador receberá os novos chamados.",
            "url": "/ti",
            "tag": "givova-ti-test",
        })
