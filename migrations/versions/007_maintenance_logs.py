"""Fuel & maintenance log tracking

Adds maintenance and fuel log records per vehicle.

Revision ID: 007_maintenance_logs
Revises: 006_driver_shifts
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '007_maintenance_logs'
down_revision = '006_driver_shifts'
branch_labels = None
depends_on = None

MAINTENANCE_TYPE = sa.Enum(
    'fuel', 'oil_change', 'tire_rotation', 'repair', 'inspection', 'scheduled_service',
    name='maintenancetype'
)


def upgrade() -> None:
    MAINTENANCE_TYPE.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'maintenance_logs',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('vehicle_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('type', MAINTENANCE_TYPE, nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('odometer', sa.Float(), nullable=False),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
    )

    op.create_index('ix_maintenance_logs_tenant_id', 'maintenance_logs', ['tenant_id'])
    op.create_index('ix_maintenance_logs_vehicle_id', 'maintenance_logs', ['vehicle_id'])
    op.create_index('ix_maintenance_logs_tenant_date', 'maintenance_logs', ['tenant_id', 'date'])


def downgrade() -> None:
    op.drop_table('maintenance_logs')
    MAINTENANCE_TYPE.drop(op.get_bind(), checkfirst=True)
