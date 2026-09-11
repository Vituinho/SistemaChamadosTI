"""Add requester location and affected system without changing existing tickets."""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tickets", sa.Column("location", sa.String(160), nullable=False, server_default=""))
    op.add_column("tickets", sa.Column("affected_system", sa.String(80), nullable=False, server_default=""))
    op.create_index("ix_tickets_affected_system", "tickets", ["affected_system"])


def downgrade():
    op.drop_index("ix_tickets_affected_system", table_name="tickets")
    op.drop_column("tickets", "affected_system")
    op.drop_column("tickets", "location")
