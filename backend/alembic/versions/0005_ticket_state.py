"""Add the Brazilian state recorded when opening a ticket."""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tickets", sa.Column("state", sa.String(2), nullable=False, server_default=""))
    op.create_index("ix_tickets_state", "tickets", ["state"])


def downgrade():
    op.drop_index("ix_tickets_state", table_name="tickets")
    op.drop_column("tickets", "state")
