"""Store Web Push subscriptions for TI computers."""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(256), nullable=False),
        sa.Column("auth", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_subscriptions_technician_id", "push_subscriptions", ["technician_id"])


def downgrade():
    op.drop_index("ix_push_subscriptions_technician_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
