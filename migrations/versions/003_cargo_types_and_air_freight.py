"""Cargo types and air freight

Adds the cargo taxonomy and the air transport mode:
  * new enum types `transportmode` and `cargotype`
  * freighter / turboprop vehicle types, Jet A-1 fuel, air cargo terminal hubs
  * air-only asset columns (tail number, ULD positions, range)
  * cargo type, transport mode, pieces and air waybill columns on orders

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on
PostgreSQL < 12, so each new enum member is committed on its own connection.

Revision ID: 003_cargo_and_air_freight
Revises: 002_analytics_views
Create Date: 2026-08-09
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '003_cargo_and_air_freight'
down_revision = '002_analytics_views'
branch_labels = None
depends_on = None


TRANSPORT_MODE = sa.Enum('road', 'air', name='transportmode')
CARGO_TYPE = sa.Enum(
    'general', 'parcel', 'palletized', 'refrigerated', 'fragile',
    'hazmat', 'liquid_bulk', 'oversized', 'high_value',
    name='cargotype',
)

# (existing enum type, new member)
NEW_ENUM_MEMBERS = [
    ('vehicletype', 'freighter'),
    ('vehicletype', 'turboprop'),
    ('fueltype', 'jet_a1'),
    ('hubtype', 'air_cargo_terminal'),
]


def upgrade() -> None:
    bind = op.get_bind()

    # Outside the migration transaction: a value added to an enum may not be
    # referenced by the same transaction that created it.
    with op.get_context().autocommit_block():
        for type_name, value in NEW_ENUM_MEMBERS:
            op.execute(sa.text(f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{value}'"))

    TRANSPORT_MODE.create(bind, checkfirst=True)
    CARGO_TYPE.create(bind, checkfirst=True)

    # ─── Vehicles ─────────────────────────────────────────────────────────────
    op.add_column('vehicles', sa.Column(
        'transport_mode', TRANSPORT_MODE, nullable=False, server_default='road',
    ))
    op.add_column('vehicles', sa.Column(
        'has_refrigeration', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    op.add_column('vehicles', sa.Column('tail_number', sa.String(length=12), nullable=True))
    op.add_column('vehicles', sa.Column('uld_positions', sa.Integer(), nullable=True))
    op.add_column('vehicles', sa.Column('range_km', sa.Float(), nullable=True))
    op.create_index('ix_vehicles_transport_mode', 'vehicles', ['transport_mode'])

    # Any freighter already registered under the old schema is an air asset
    op.execute("""
        UPDATE vehicles SET transport_mode = 'air'
        WHERE vehicle_type::text IN ('freighter', 'turboprop')
    """)

    # ─── Hubs ─────────────────────────────────────────────────────────────────
    op.add_column('hubs', sa.Column('iata_code', sa.String(length=3), nullable=True))
    op.add_column('hubs', sa.Column(
        'handles_air_cargo', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))

    # ─── Orders ───────────────────────────────────────────────────────────────
    op.add_column('orders', sa.Column(
        'cargo_type', CARGO_TYPE, nullable=False, server_default='general',
    ))
    op.add_column('orders', sa.Column(
        'transport_mode', TRANSPORT_MODE, nullable=False, server_default='road',
    ))
    op.add_column('orders', sa.Column('pieces', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('air_waybill_number', sa.String(length=20), nullable=True))
    op.add_column('orders', sa.Column('flight_number', sa.String(length=10), nullable=True))
    op.add_column('orders', sa.Column('hazmat_un_code', sa.String(length=10), nullable=True))
    op.create_index('ix_orders_cargo_type', 'orders', ['cargo_type'])
    op.create_index('ix_orders_transport_mode', 'orders', ['transport_mode'])
    op.create_index('ix_orders_tenant_mode', 'orders', ['tenant_id', 'transport_mode'])
    op.create_index('ix_orders_air_waybill_number', 'orders', ['air_waybill_number'])

    # Carry the old boolean handling flags into the new taxonomy
    op.execute("UPDATE orders SET cargo_type = 'refrigerated' WHERE requires_refrigeration IS TRUE")
    op.execute("""
        UPDATE orders SET cargo_type = 'fragile'
        WHERE fragile IS TRUE AND requires_refrigeration IS NOT TRUE
    """)


def downgrade() -> None:
    op.drop_index('ix_orders_air_waybill_number', table_name='orders')
    op.drop_index('ix_orders_tenant_mode', table_name='orders')
    op.drop_index('ix_orders_transport_mode', table_name='orders')
    op.drop_index('ix_orders_cargo_type', table_name='orders')
    for column in ('hazmat_un_code', 'flight_number', 'air_waybill_number',
                   'pieces', 'transport_mode', 'cargo_type'):
        op.drop_column('orders', column)

    op.drop_column('hubs', 'handles_air_cargo')
    op.drop_column('hubs', 'iata_code')

    op.drop_index('ix_vehicles_transport_mode', table_name='vehicles')
    for column in ('range_km', 'uld_positions', 'tail_number',
                   'has_refrigeration', 'transport_mode'):
        op.drop_column('vehicles', column)

    bind = op.get_bind()
    CARGO_TYPE.drop(bind, checkfirst=True)
    TRANSPORT_MODE.drop(bind, checkfirst=True)
    # Members added to pre-existing enum types are left in place: PostgreSQL has
    # no ALTER TYPE ... DROP VALUE, and removing them would need a type rewrite.
