"""Remove location from tickets; keep tickets and their history."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("tickets", "location")


def downgrade():
    # Removed locations cannot be recovered; older code receives an empty value.
    op.add_column("tickets", sa.Column("location", sa.String(160), nullable=False, server_default=""))
