"""Initial schema and PostgreSQL Row-Level Security (RLS) policies

Revision ID: 001_initial_schema_and_rls
Revises: 
Create Date: 2026-08-09
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '001_initial_schema_and_rls'
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = [
    'users',
    'hubs',
    'vehicles',
    'drivers',
    'orders',
    'order_events',
    'routes',
    'route_stops',
    'gps_pings',
]


def upgrade() -> None:
    # Enable PostGIS & UUID extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

    # Enable Row-Level Security (RLS) on each tenant-scoped table
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {table}_tenant_isolation_policy ON {table}
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
        """)


def downgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation_policy ON {table};")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
