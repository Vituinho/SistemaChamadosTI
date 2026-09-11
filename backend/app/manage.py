"""Local provisioning: python -m app.manage create-user / seed."""
import argparse
import getpass
import secrets
import base64
from sqlalchemy import select
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid01
from .database import SessionLocal
from .models import Technician, Ticket, TicketHistory
from .security import passwords, digest
from .catalog import DEPARTMENTS, CATEGORIES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["create-user", "seed", "generate-vapid"])
    args = parser.parse_args()
    if args.command == "generate-vapid":
        vapid = Vapid01()
        vapid.generate_keys()
        private_value = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        public_value = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode()
        print("VAPID_PRIVATE_KEY=" + encode(private_value))
        print("VAPID_PUBLIC_KEY=" + encode(public_value))
        print("Guarde a chave privada somente no Render. Gere o par apenas uma vez.")
        return
    with SessionLocal() as db:
        if args.command == "create-user":
            username = input("Usuário: ").strip().lower()
            name = input("Nome: ").strip()
            password = getpass.getpass("Senha (mínimo 12 caracteres): ")
            confirm = getpass.getpass("Repita a senha: ")
            if not 1 <= len(username) <= 80 or not 2 <= len(name) <= 120 or not 12 <= len(password) <= 256 or password != confirm:
                raise SystemExit("Dados inválidos ou senhas diferentes. Nada foi gravado.")
            if db.scalar(select(Technician).where(Technician.username == username)):
                raise SystemExit("Usuário já existe. Nada foi alterado.")
            db.add(Technician(username=username, name=name, password_hash=passwords.hash(password)))
            db.commit()
            print("Técnico criado. Faça login no painel /ti.")
        else:
            if db.scalar(select(Ticket.id).limit(1)):
                print("Há chamados no banco; seed ignorado.")
                return
            ticket = Ticket(name="Colaborador de demonstração", department=DEPARTMENTS[0], location="Matriz",
                            category=CATEGORIES[0], affected_system="", title="Chamado de demonstração",
                            description="Dados fictícios para desenvolvimento.", access_hash=digest(secrets.token_urlsafe(32)))
            db.add(ticket)
            db.flush()
            db.add(TicketHistory(ticket_id=ticket.id, message="Chamado fictício criado pelo seed"))
            db.commit()
            print("Seed concluído. Os catálogos estão em app/catalog.py e não dependem do seed.")


if __name__ == "__main__":
    main()
