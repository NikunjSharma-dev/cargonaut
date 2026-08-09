"""Vehicle breadcrumb index

Route replay reads `gps_pings` filtered by vehicle over a time window. The
existing indexes cover (tenant_id, timestamp) and (driver_id, timestamp), so a
per-vehicle range scan fell back to a filter over the whole tenant partition.

Adds the composite index that query actually needs. No columns change, so no
existing row is touched or rewritten.

Revision ID: 004_vehicle_track_index
Revises: 003_cargo_and_air_freight
Create Date: 2026-08-10
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = '004_vehicle_track_index'
down_revision = '003_cargo_and_air_freight'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_gps_pings_vehicle_ts',
        'gps_pings',
        ['vehicle_id', 'timestamp'],
    )


def downgrade() -> None:
    op.drop_index('ix_gps_pings_vehicle_ts', table_name='gps_pings')
