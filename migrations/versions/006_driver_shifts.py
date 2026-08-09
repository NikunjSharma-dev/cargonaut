"""Driver shift roster

Adds dated driver-to-vehicle assignments.

This is distinct from `drivers.shift_start` / `drivers.shift_end`, which stay
put: those describe a driver's recurring daily pattern, while a row here is a
concrete rostered window on a date. Neither replaces the other.

Windows are half-open — [starts_at, ends_at) — so a handover at 18:00 between
a shift ending then and one starting then is not an overlap.

The table is new, so no existing row is read or rewritten.

Revision ID: 006_driver_shifts
Revises: 005_geofences_and_events
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_driver_shifts'
down_revision = '005_geofences_and_events'
branch_labels = None
depends_on = None


SHIFT_STATUS = sa.Enum('scheduled', 'active', 'completed', 'cancelled', name='shiftstatus')


def upgrade() -> None:
    SHIFT_STATUS.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'shifts',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('driver_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('vehicle_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', SHIFT_STATUS, nullable=False, server_default='scheduled'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        # Backstop for the API's own validation — a zero-length or reversed
        # window is meaningless whatever wrote it.
        sa.CheckConstraint('ends_at > starts_at', name='ck_shifts_window_ordered'),
    )

    op.create_index('ix_shifts_tenant_id', 'shifts', ['tenant_id'])
    op.create_index('ix_shifts_driver_id', 'shifts', ['driver_id'])
    op.create_index('ix_shifts_vehicle_id', 'shifts', ['vehicle_id'])
    op.create_index('ix_shifts_tenant_start', 'shifts', ['tenant_id', 'starts_at'])
    op.create_index('ix_shifts_driver_window', 'shifts', ['driver_id', 'starts_at', 'ends_at'])
    op.create_index('ix_shifts_vehicle_window', 'shifts', ['vehicle_id', 'starts_at', 'ends_at'])


def downgrade() -> None:
    op.drop_table('shifts')
    SHIFT_STATUS.drop(op.get_bind(), checkfirst=True)
