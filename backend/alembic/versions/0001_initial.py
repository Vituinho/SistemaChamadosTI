"""Initial V1 schema. Independent of application models."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("technicians",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False))
    op.create_table("sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("access_hash", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("department", sa.String(80), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("priority", sa.String(15), nullable=False),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("solution", sa.Text()),
        sa.CheckConstraint("status IN ('NOVO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','AGUARDANDO_TERCEIRO','RESOLVIDO','CANCELADO')", name="ticket_status"),
        sa.CheckConstraint("priority IN ('BAIXA','NORMAL','ALTA','URGENTE')", name="ticket_priority"))
    op.create_index("ix_tickets_department", "tickets", ["department"])
    op.create_index("ix_tickets_status", "tickets", ["status"])
    op.create_table("ticket_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_ticket_history_ticket_id", "ticket_history", ["ticket_id"])
    op.create_table("attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("mime", sa.String(40), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False))


def downgrade():
    op.drop_table("attachments")
    op.drop_table("ticket_history")
    op.drop_table("tickets")
    op.drop_table("sessions")
    op.drop_table("technicians")
