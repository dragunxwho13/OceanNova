"""
Canonical registry of the real data sources OCEANNOVA ingests.

OCEANNOVA is a self-fed model: it does not accept user uploads. It pulls
directly from the public Earth-observation sources declared here and runs
its DETECT -> EXPLAIN -> CLASSIFY -> FLAG pipeline on the live data.

This module is intentionally dependency-free so it can be imported anywhere
(loaders, the Streamlit app, tests, or a thin API bridge to the web frontend)
as the single source of truth for where data comes from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

# NASA PACE OCI L2 product short names used when searching Earthdata / CMR.
PACE_SHORT_NAMES: tuple[str, ...] = ("PACE_OCI_L2_BGC", "PACE_OCI_L2_AOP")


@dataclass(frozen=True)
class DataSource:
    key: str
    name: str
    provider: str
    kind: str  # "primary" | "cross_check" | "mask" | "helper" | "io"
    url: str
    description: str
    python: Optional[str] = None  # install/import hint
    notes: tuple[str, ...] = field(default_factory=tuple)


DATA_SOURCES: tuple[DataSource, ...] = (
    DataSource(
        key="nasa_pace_earthdata",
        name="NASA Earthdata — PACE OCI L2 granules",
        provider="NASA",
        kind="primary",
        url="https://search.earthdata.nasa.gov/",
        description=(
            "Primary input. Hyperspectral ocean-colour reflectance (Rrs) from the "
            "PACE OCI instrument, L2 granules. Product short names: "
            "PACE_OCI_L2_BGC and PACE_OCI_L2_AOP."
        ),
        python="pip install earthaccess xarray netCDF4",
        notes=(
            "Requires a free NASA Earthdata login (https://urs.earthdata.nasa.gov/).",
            "Direct archive: https://oceandata.sci.gsfc.nasa.gov/",
            "Public CMR search (no auth): https://cmr.earthdata.nasa.gov/search/granules.json",
        ),
    ),
    DataSource(
        key="noaa_hab_bulletins",
        name="NOAA HAB bulletins",
        provider="NOAA NCCOS",
        kind="cross_check",
        url="https://coastalscience.noaa.gov/science-areas/habs/hab-forecasts/",
        description=(
            "Harmful Algal Bloom forecast bulletins, published per region. Used to "
            "cross-check the model's classifications (e.g. red_tide / "
            "phytoplankton_bloom) against independent operational forecasts."
        ),
    ),
    DataSource(
        key="natural_earth",
        name="Natural Earth shapefiles",
        provider="Natural Earth",
        kind="mask",
        url="https://www.naturalearthdata.com/",
        description=(
            "Vector land/coastline polygons used to build a land/ocean mask so the "
            "pipeline only scores ocean pixels."
        ),
        python="pip install geopandas",
    ),
    DataSource(
        key="earthaccess",
        name="earthaccess",
        provider="NASA / community",
        kind="helper",
        url="https://earthaccess.readthedocs.io/",
        description=(
            "Helper library that handles NASA Earthdata authentication and granule "
            "download/search so PACE granules can be pulled programmatically."
        ),
        python="pip install earthaccess",
    ),
    DataSource(
        key="xarray_netcdf",
        name="xarray + netCDF4",
        provider="community",
        kind="io",
        url="https://docs.xarray.dev/",
        description=(
            "Used to open the NetCDF L2 granules in Python and extract Rrs bands and "
            "navigation (lat/lon) groups (see io_pace.py)."
        ),
        python="pip install xarray netCDF4",
    ),
)


def by_kind(kind: str) -> tuple[DataSource, ...]:
    """Return all registered sources of a given kind."""
    return tuple(s for s in DATA_SOURCES if s.kind == kind)


def primary_sources() -> tuple[DataSource, ...]:
    return by_kind("primary")


def as_dicts() -> list[dict]:
    """Serialisable view — handy for a thin API bridge to the web frontend."""
    return [
        {
            "key": s.key,
            "name": s.name,
            "provider": s.provider,
            "kind": s.kind,
            "url": s.url,
            "description": s.description,
            "python": s.python,
            "notes": list(s.notes),
        }
        for s in DATA_SOURCES
    ]


if __name__ == "__main__":
    import json

    print(json.dumps(as_dicts(), indent=2))
