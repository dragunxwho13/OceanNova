"""
Loader for real NASA PACE OCI L2 data (NetCDF).

OCEANNOVA is NOT a data-fed model. It does not wait for a user to upload a
file — it pulls directly from the public Earth-observation sources listed in
`data_sources.py` and runs its DETECT -> EXPLAIN -> CLASSIFY -> FLAG pipeline
on whatever the sources currently publish.

Primary data sources (see oceannova.data_sources for the machine-readable list):
  - NASA Earthdata — PACE OCI L2 granules (PACE_OCI_L2_BGC / PACE_OCI_L2_AOP)
      Browse/search: https://search.earthdata.nasa.gov/
      Direct:        https://oceandata.sci.gsfc.nasa.gov/
  - NOAA NCCOS Harmful Algal Bloom (HAB) bulletins — cross-check layer
  - Natural Earth shapefiles — land/ocean mask via geopandas
  - earthaccess — helper for authenticated Earthdata downloads
  - xarray, netCDF4 — open the NetCDF L2 granules in Python

Setup steps:
  1. Create a free NASA Earthdata account: https://urs.earthdata.nasa.gov/
  2. Search PACE L2 granules via https://search.earthdata.nasa.gov/ (search
     "PACE_OCI_L2_AOP" or "PACE_OCI_L2_BGC").
  3. `pip install earthaccess xarray netCDF4 geopandas`
  4. Authenticate: `earthaccess.login()` (uses your Earthdata credentials).
  5. Verify the granule opens and inspect variable/QC-flag names, since they
     can shift between product versions.

Expected real-data steps this module implements:
  - Open the NetCDF granule with xarray (grouped datasets)
  - Extract Rrs (remote sensing reflectance) per band, lat/lon
  - Apply L2 QC flags (drop cloud/land/glint-flagged pixels)
  - Mask land using Natural Earth shapefiles via geopandas
  - Reshape to the same tidy DataFrame format as
    synthetic_data.generate_scene() (columns: lat, lon, band_<wavelength>...,
    plus any available SST)
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from .data_sources import PACE_SHORT_NAMES


def search_pace_granules(
    short_name: str = "PACE_OCI_L2_BGC",
    bbox: Optional[tuple[float, float, float, float]] = None,
    count: int = 5,
):
    """
    Search NASA Earthdata for the most recent PACE OCI L2 granules using
    `earthaccess`. Returns granule handles that `download_pace_granule`
    can fetch. Requires `earthaccess.login()` to have succeeded.

    The web frontend surfaces the same listing via the public NASA CMR
    search API (no auth) so visitors can see what the model is ingesting;
    this function is the authenticated Python path that actually pulls the
    pixel-level NetCDF granules.
    """
    if short_name not in PACE_SHORT_NAMES:
        raise ValueError(
            f"Unknown PACE short_name {short_name!r}; expected one of {PACE_SHORT_NAMES}"
        )
    try:
        import earthaccess  # noqa: F401
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise ImportError(
            "earthaccess is required for live PACE search. "
            "Install with `pip install earthaccess` and run earthaccess.login()."
        ) from exc

    import earthaccess

    return earthaccess.search_data(short_name=short_name, bounding_box=bbox, count=count)


def load_pace_granule(path: str) -> pd.DataFrame:
    """
    Load a PACE OCI L2 NetCDF granule into the tidy DataFrame format used by
    the rest of the pipeline (see module docstring for expected shape).

    Recommended implementation uses `xarray.open_dataset(path,
    group="geophysical_data")` for Rrs and `group="navigation_data"` for
    lat/lon (PACE L2 files are typically organized in groups), then applies
    the Natural Earth land mask via geopandas before returning.
    """
    raise NotImplementedError(
        "Real PACE pixel loading not yet implemented in this offline build. "
        "See module docstring for setup steps. Until credentials are wired in, "
        "use synthetic_data.generate_scene() for development. The model's data "
        "acquisition path (search_pace_granules) targets the sources listed in "
        "oceannova.data_sources."
    )
