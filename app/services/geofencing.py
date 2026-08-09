"""
Cargonaut — Geofence geometry helpers.

A fence is always stored as a closed polygon ring, whatever the dispatcher drew:
a circle is buffered into one at write time. That keeps a single containment
query for every fence instead of branching on shape at read time.

Rings are held twice on purpose:
  * `area`     — PostGIS geometry, used by ST_Contains and the spatial index.
  * `boundary` — the same ring as JSON, returned straight to the map and used
                 for containment when PostGIS is unavailable (the SQLite test
                 engine maps Geometry to Text). Both are written together by
                 `ring_columns()` so they cannot drift.

Coordinates are [longitude, latitude] throughout, matching GeoJSON and PostGIS
argument order. Latitude-first tuples are a common source of silent bugs here,
so nothing in this module accepts them.
"""

import math
from typing import List, Sequence, Tuple

Ring = List[List[float]]

EARTH_RADIUS_M = 6_371_000.0

# Segments used to approximate a circle. 48 keeps the worst-case radial error
# under 0.15% — well inside GPS accuracy — without bloating the stored ring.
CIRCLE_SEGMENTS = 48

MIN_RING_VERTICES = 3
MAX_RING_VERTICES = 500


def circle_to_ring(
    latitude: float,
    longitude: float,
    radius_m: float,
    segments: int = CIRCLE_SEGMENTS,
) -> Ring:
    """
    Approximate a circle on the sphere as a closed polygon ring.

    Longitude degrees shrink with latitude, so the east-west step is divided by
    cos(lat); without it a fence drawn in Delhi would come out as an ellipse
    roughly 12% too narrow.
    """
    if radius_m <= 0:
        raise ValueError("radius_m must be positive")

    lat_rad = math.radians(latitude)
    # Guard the poles, where cos(lat) collapses to zero
    cos_lat = max(math.cos(lat_rad), 1e-6)

    d_lat = math.degrees(radius_m / EARTH_RADIUS_M)
    d_lon = math.degrees(radius_m / (EARTH_RADIUS_M * cos_lat))

    # A large radius near a pole blows d_lon up past a full turn, which would
    # store a polygon with longitudes far outside ±180 — invalid geometry that
    # makes ST_Contains raise instead of returning false.
    if d_lon > 180.0 or d_lat > 90.0:
        raise ValueError(
            "That radius is too large at this latitude to describe a valid zone"
        )

    ring: Ring = []
    for i in range(segments):
        theta = 2.0 * math.pi * i / segments
        ring.append([
            longitude + d_lon * math.cos(theta),
            latitude + d_lat * math.sin(theta),
        ])
    ring.append(list(ring[0]))  # close it

    for lon, lat in ring:
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            raise ValueError(
                "That circle runs off the edge of the map — reduce the radius "
                "or move the centre away from the pole or antimeridian"
            )
    return ring


def normalise_ring(points: Sequence[Sequence[float]]) -> Ring:
    """
    Validate a caller-supplied ring and return it closed.

    Accepts an open ring (the common case from a drawing UI) and closes it.
    """
    ring = [[float(lon), float(lat)] for lon, lat in points]

    # A ring that arrives already closed still needs 3 distinct vertices
    distinct = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if len(distinct) < MIN_RING_VERTICES:
        raise ValueError("A polygon geofence needs at least 3 distinct points")
    if len(distinct) > MAX_RING_VERTICES:
        raise ValueError(f"A polygon geofence may not exceed {MAX_RING_VERTICES} points")

    for lon, lat in distinct:
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude {lon} out of range")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude {lat} out of range")

    return [*distinct, list(distinct[0])]


def ring_to_wkt(ring: Ring) -> str:
    """Closed ring → `POLYGON((lon lat, ...))` for PostGIS."""
    coords = ", ".join(f"{lon} {lat}" for lon, lat in ring)
    return f"POLYGON(({coords}))"


def point_in_ring(latitude: float, longitude: float, ring: Sequence[Sequence[float]]) -> bool:
    """
    Ray-casting point-in-polygon, used wherever PostGIS is not available.

    Counts crossings of a ray cast east from the point; an odd count means the
    point is inside. Treats the ring as planar, which is accurate at the scale a
    geofence covers.
    """
    inside = False
    count = len(ring)
    if count < 4:  # closed ring of a triangle is the smallest valid input
        return False

    j = count - 1
    for i in range(count):
        lon_i, lat_i = ring[i][0], ring[i][1]
        lon_j, lat_j = ring[j][0], ring[j][1]

        # Does the edge straddle the point's latitude?
        if (lat_i > latitude) != (lat_j > latitude):
            # Longitude where the edge crosses that latitude
            crossing_lon = lon_i + (latitude - lat_i) * (lon_j - lon_i) / (lat_j - lat_i)
            if longitude < crossing_lon:
                inside = not inside
        j = i

    return inside


def ring_bounds(ring: Sequence[Sequence[float]]) -> Tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat) — used to centre the map on a fence."""
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lons), min(lats), max(lons), max(lats)
