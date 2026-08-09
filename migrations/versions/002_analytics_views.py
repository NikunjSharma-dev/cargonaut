"""Analytics SQL Views for Driver Performance, SLA, and Fleet Utilization

Revision ID: 002_analytics_views
Revises: 001_initial_schema_and_rls
Create Date: 2026-08-09
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_analytics_views'
down_revision = '001_initial_schema_and_rls'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Driver Performance View
    op.execute("""
        CREATE OR REPLACE VIEW vw_driver_performance AS
        SELECT 
            d.tenant_id,
            d.id AS driver_id,
            d.full_name,
            d.phone,
            COUNT(o.id) AS total_assigned_orders,
            COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) AS delivered_orders,
            COUNT(CASE WHEN o.status = 'failed' THEN 1 END) AS failed_orders,
            ROUND(
                CAST(COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) AS DECIMAL) / 
                NULLIF(COUNT(o.id), 0) * 100, 2
            ) AS completion_rate_pct
        FROM drivers d
        LEFT JOIN orders o ON o.driver_id = d.id AND o.tenant_id = d.tenant_id
        GROUP BY d.tenant_id, d.id, d.full_name, d.phone;
    """)

    # 2. SLA Performance View
    op.execute("""
        CREATE OR REPLACE VIEW vw_sla_performance AS
        SELECT 
            tenant_id,
            COUNT(id) AS total_orders,
            COUNT(CASE WHEN status = 'delivered' AND (actual_delivery <= sla_deadline OR sla_deadline IS NULL) THEN 1 END) AS on_time_deliveries,
            COUNT(CASE WHEN sla_deadline IS NOT NULL AND (actual_delivery > sla_deadline OR (status NOT IN ('delivered', 'cancelled') AND NOW() > sla_deadline)) THEN 1 END) AS sla_breaches,
            ROUND(
                CAST(COUNT(CASE WHEN status = 'delivered' AND (actual_delivery <= sla_deadline OR sla_deadline IS NULL) THEN 1 END) AS DECIMAL) / 
                NULLIF(COUNT(id), 0) * 100, 2
            ) AS on_time_delivery_rate_pct
        FROM orders
        GROUP BY tenant_id;
    """)

    # 3. Fleet Utilization View
    op.execute("""
        CREATE OR REPLACE VIEW vw_fleet_utilization AS
        SELECT 
            v.tenant_id,
            v.id AS vehicle_id,
            v.registration_number,
            v.vehicle_type,
            v.status,
            v.odometer_km,
            COUNT(o.id) AS completed_trips
        FROM vehicles v
        LEFT JOIN orders o ON o.vehicle_id = v.id AND o.status = 'delivered'
        GROUP BY v.tenant_id, v.id, v.registration_number, v.vehicle_type, v.status, v.odometer_km;
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_fleet_utilization;")
    op.execute("DROP VIEW IF EXISTS vw_sla_performance;")
    op.execute("DROP VIEW IF EXISTS vw_driver_performance;")
