"""Geofences and geofence events

Adds dispatcher-drawn zones and the enter/exit transitions vehicles make
against them.

A fence is always stored as a closed polygon ring:
  * `area`     — PostGIS POLYGON, queried with ST_Contains and GiST-indexed
  * `boundary` — the same ring as JSONB, returned to the map and used for
                 containment when PostGIS is unavailable

Circles keep their centre and radius alongside so the UI can re-edit them as a
circle rather than as 48 polygon vertices.

Both tables are new, so no existing row is read or rewritten.

Revision ID: 005_geofences_and_events
Revises: 004_vehicle_track_index
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005_geofences_and_events'
down_revision = '004_vehicle_track_index'
branch_labels = None
depends_on = None


GEOFENCE_KIND = sa.Enum('circle', 'polygon', name='geofencekind')
GEOFENCE_EVENT_TYPE = sa.Enum('enter', 'exit', name='geofenceeventtype')


def upgrade() -> None:
    bind = op.get_bind()
    GEOFENCE_KIND.create(bind, checkfirst=True)
    GEOFENCE_EVENT_TYPE.create(bind, checkfirst=True)

    op.create_table(
        'geofences',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('hub_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('kind', GEOFENCE_KIND, nullable=False, server_default='circle'),
        sa.Column('area', Geometry(geometry_type='POLYGON', srid=4326, spatial_index=False), nullable=True),
        sa.Column('boundary', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('centre_latitude', sa.Float(), nullable=True),
        sa.Column('centre_longitude', sa.Float(), nullable=True),
        sa.Column('radius_m', sa.Float(), nullable=True),
        sa.Column('alert_on_enter', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('alert_on_exit', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('colour', sa.String(length=9), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['hub_id'], ['hubs.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_geofences_tenant_id', 'geofences', ['tenant_id'])
    op.create_index('ix_geofences_tenant_active', 'geofences', ['tenant_id', 'is_active'])
    # GiST index is what makes ST_Contains cheap once a tenant has many fences
    op.create_index(
        'ix_geofences_area', 'geofences', ['area'], postgresql_using='gist',
    )

    op.create_table(
        'geofence_events',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('geofence_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('vehicle_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('driver_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column('event_type', GEOFENCE_EVENT_TYPE, nullable=False),
        sa.Column('is_alert', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['geofence_id'], ['geofences.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_geofence_events_tenant_id', 'geofence_events', ['tenant_id'])
    op.create_index('ix_geofence_events_geofence_id', 'geofence_events', ['geofence_id'])
    op.create_index('ix_geofence_events_occurred_at', 'geofence_events', ['occurred_at'])
    op.create_index('ix_geofence_events_tenant_ts', 'geofence_events',
                    ['tenant_id', 'occurred_at'])
    op.create_index('ix_geofence_events_vehicle_fence', 'geofence_events',
                    ['vehicle_id', 'geofence_id', 'occurred_at'])


def downgrade() -> None:
    op.drop_table('geofence_events')
    op.drop_index('ix_geofences_area', table_name='geofences')
    op.drop_table('geofences')

    bind = op.get_bind()
    GEOFENCE_EVENT_TYPE.drop(bind, checkfirst=True)
    GEOFENCE_KIND.drop(bind, checkfirst=True)
