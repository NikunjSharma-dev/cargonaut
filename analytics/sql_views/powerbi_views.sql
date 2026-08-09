-- ============================================================
-- FleetForge OSS — SQL Views for Power BI Embedded Pipeline
-- Connect Power BI Desktop to these views per tenant.
-- Apply RLS in Power BI using tenant_id filter on token.
-- ============================================================

-- 1. Daily order volume per tenant
CREATE OR REPLACE VIEW vw_daily_order_volume AS
SELECT
    tenant_id,
    DATE(created_at)            AS order_date,
    COUNT(*)                    AS total_orders,
    COUNT(*) FILTER (WHERE status = 'delivered')   AS delivered,
    COUNT(*) FILTER (WHERE status = 'failed')      AS failed,
    COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled,
    SUM(delivery_fee)           AS revenue
FROM orders
GROUP BY tenant_id, DATE(created_at);


-- 2. Driver performance
CREATE OR REPLACE VIEW vw_driver_performance AS
SELECT
    d.tenant_id,
    d.id                        AS driver_id,
    d.full_name,
    d.rating,
    COUNT(o.id)                 AS total_orders,
    COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS delivered,
    COUNT(o.id) FILTER (WHERE o.status = 'failed')    AS failed,
    ROUND(
        100.0 * COUNT(o.id) FILTER (WHERE o.status = 'delivered')
        / NULLIF(COUNT(o.id), 0), 2
    )                           AS success_rate_pct,
    AVG(
        EXTRACT(EPOCH FROM (o.actual_delivery - o.actual_pickup)) / 3600
    )                           AS avg_delivery_hours
FROM drivers d
LEFT JOIN orders o ON o.driver_id = d.id
GROUP BY d.tenant_id, d.id, d.full_name, d.rating;


-- 3. SLA performance
CREATE OR REPLACE VIEW vw_sla_performance AS
SELECT
    tenant_id,
    DATE(created_at)            AS order_date,
    COUNT(*)                    AS total_orders,
    COUNT(*) FILTER (
        WHERE status = 'delivered' AND actual_delivery <= sla_deadline
    )                           AS on_time,
    COUNT(*) FILTER (
        WHERE sla_deadline IS NOT NULL AND
              (actual_delivery > sla_deadline OR
               (status NOT IN ('delivered', 'cancelled') AND sla_deadline < NOW()))
    )                           AS sla_breaches,
    ROUND(
        100.0 * COUNT(*) FILTER (
            WHERE sla_deadline IS NOT NULL AND
                  (actual_delivery > sla_deadline OR
                   (status NOT IN ('delivered', 'cancelled') AND sla_deadline < NOW()))
        ) / NULLIF(COUNT(*), 0), 2
    )                           AS breach_rate_pct
FROM orders
WHERE sla_deadline IS NOT NULL
GROUP BY tenant_id, DATE(created_at);


-- 4. Fleet utilization
CREATE OR REPLACE VIEW vw_fleet_utilization AS
SELECT
    v.tenant_id,
    v.id                        AS vehicle_id,
    v.registration_number,
    v.vehicle_type,
    v.fuel_type,
    v.payload_capacity_kg,
    v.status,
    v.odometer_km,
    COUNT(o.id)                 AS total_orders,
    COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
    ROUND(
        100.0 * COUNT(o.id) FILTER (WHERE o.status = 'delivered')
        / NULLIF(30, 0), 2
    )                           AS utilization_pct_30d
FROM vehicles v
LEFT JOIN orders o ON o.vehicle_id = v.id
    AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY v.tenant_id, v.id, v.registration_number, v.vehicle_type,
         v.fuel_type, v.payload_capacity_kg, v.status, v.odometer_km;


-- 5. Revenue by city
CREATE OR REPLACE VIEW vw_revenue_by_city AS
SELECT
    tenant_id,
    delivery_city,
    COUNT(*)                    AS order_count,
    SUM(delivery_fee)           AS total_revenue,
    AVG(delivery_fee)           AS avg_order_value,
    currency
FROM orders
WHERE status = 'delivered'
GROUP BY tenant_id, delivery_city, currency;


-- 6. Hub throughput
CREATE OR REPLACE VIEW vw_hub_throughput AS
SELECT
    h.tenant_id,
    h.id                        AS hub_id,
    h.name                      AS hub_name,
    h.hub_type,
    h.city,
    COUNT(o_out.id)             AS outbound_orders,
    COUNT(o_in.id)              AS inbound_orders
FROM hubs h
LEFT JOIN orders o_out ON o_out.origin_hub_id = h.id
LEFT JOIN orders o_in  ON o_in.destination_hub_id = h.id
GROUP BY h.tenant_id, h.id, h.name, h.hub_type, h.city;
