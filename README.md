# OCEANNOVA

**AI-Powered Hyperspectral Ocean Anomaly Intelligence**

> When the ocean looks different, OCEANNOVA finds it, explains what changed, estimates why, and tells researchers when the anomaly doesn't look like anything they already know.

DETECT → EXPLAIN → CLASSIFY → FLAG THE UNKNOWN

## What this is

OCEANNOVA turns NASA PACE hyperspectral ocean-colour data (200+ wavelengths,
UV through NIR) into a scientific screening workflow: it learns what normal
ocean spectral signatures look like for a region, flags pixels that deviate,
classifies the *likely* observable cause using spectral + environmental
context, and — critically — does **not** force every anomaly into a known
category. Low-confidence or out-of-distribution signatures are explicitly
flagged `unknown_mixed` for human review.

The cause taxonomy spans two tiers:

- **Direct optical causes** — things ocean-colour reflectance can plausibly
  detect fairly directly: `phytoplankton_bloom`, `red_tide`, `turbidity`,
  `sediment_plume`, `sediment_intrusion`, `cdom_terrestrial`, `oil_spill`.
- **Proxy event causes** — geophysical/dynamical events ocean colour cannot
  see directly, only a secondary optical/thermal signature they can leave
  behind: `volcanic_eruption`, `earthquake_seismic`, `tsunami`,
  `heatwave_ecosystem`, `unusual_current_disturbance`. The pipeline and demo
  UI flag these explicitly as proxy signatures, not direct detections, and
  recommend cross-checking against independent data (seismic networks, tide
  gauges, thermal imagery) before acting on them.

This is not a claim to have invented anomaly detection, phytoplankton
classification, or hyperspectral ocean analysis — all of those exist. The
contribution is combining anomaly detection + explanation + competing-cause
classification + an explicit unknown pathway into one workflow. See
[`docs/OCEANNOVA_Full_Hackathon_Plan.pdf`](docs/OCEANNOVA_Full_Hackathon_Plan.pdf)
for the full pitch, market landscape, and positioning.

## Status

This repo currently runs end-to-end on **synthetic PACE-shaped data**
(see [`src/oceannova/synthetic_data.py`](src/oceannova/synthetic_data.py))
so the full pipeline — preprocessing, anomaly detection, classification,
unknown detection, explainability, and the interactive demo — is testable
offline before real PACE granules are downloaded and wired in via
[`src/oceannova/io_pace.py`](src/oceannova/io_pace.py).

## Data sources (self-fed model)

OCEANNOVA is **not** a data-fed model — it does not accept user uploads. It
pulls directly from public Earth-observation sources and runs its pipeline on
whatever they currently publish. The canonical, machine-readable registry of
these sources lives in
[`src/oceannova/data_sources.py`](src/oceannova/data_sources.py):

- **NASA Earthdata — PACE OCI L2 granules** (`PACE_OCI_L2_BGC` /
  `PACE_OCI_L2_AOP`) — primary input. Search:
  https://search.earthdata.nasa.gov/
- **NOAA HAB bulletins** (NOAA NCCOS) — cross-check layer for bloom / red-tide
  classifications.
- **Natural Earth shapefiles** — land/ocean mask via `geopandas`.
- **earthaccess** — helper for authenticated Earthdata downloads
  (`pip install earthaccess`).
- **xarray, netCDF4** — open the NetCDF L2 granules in Python (see
  `io_pace.py`).

Run `python -m oceannova.data_sources` to print the full registry as JSON.

## Quickstart


```bash
git clone <your-repo-url>
cd oceannova
python -m venv .venv && source .venv/bin/activate   # or use conda
pip install -r requirements.txt

# Run the full pipeline (anomaly detection -> classification -> evidence cards)
python -m oceannova.pipeline

# Launch the interactive demo (map + spectrum + evidence card)
streamlit run app/streamlit_app.py

# Run tests
pytest tests/
```

## Pipeline

```
PACE hyperspectral data (+ NOAA / ISRO context, optional)
  -> Quality control
  -> Spectral preprocessing (normalize + derivative features)
  -> Stage 1: Anomaly detection      (PCA + Isolation Forest)
  -> Stage 2: Cause classification   (Random Forest, spectral + env features)
  -> Stage 3: Unknown/OOD detection  (confidence threshold -> unknown_mixed)
  -> Explainability (spectrum vs. baseline, top deviating wavelengths)
  -> Interactive map + evidence card (Streamlit + Plotly)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module-by-module
detail and design rationale.


## Using real PACE data

1. Create a free [NASA Earthdata account](https://urs.earthdata.nasa.gov/).
2. Search for granules at [earthdata.nasa.gov/search](https://search.earthdata.nasa.gov/)
   — product `PACE_OCI_L2_AOP` (apparent optical properties, includes Rrs)
   or `PACE_OCI_L2_BGC` (chlorophyll / biogeochemistry).
3. Download a small subset — one granule, one region (e.g. Arabian Sea /
   Bay of Bengal bounding box) — not the full global archive.
4. `pip install xarray netCDF4 earthaccess`
5. Implement `load_pace_granule()` in
   [`src/oceannova/io_pace.py`](src/oceannova/io_pace.py) to return the same
   tidy `lat, lon, band_<wavelength>..., sst_c` DataFrame shape that
   `synthetic_data.generate_scene()` produces — every downstream module
   (preprocessing, anomaly detection, classification) works unchanged.

## Known limitations

- Synthetic classes are cleanly separable by construction — classifier
  metrics on synthetic data are **not** representative of real-world
  performance. Validate against real PACE data + ground truth (e.g. NOAA
  HAB bulletins) before drawing scientific conclusions.
- The "proxy event" classes (volcanic eruption, earthquake, tsunami, unusual
  current disturbance) are NOT direct detections of those events — ocean
  colour only observes a secondary optical/thermal effect that *might* be
  associated with one. Treat a prediction in this group as a lead to check
  against independent data, never as a confirmed event.
- Satellite hyperspectral data observes ocean-surface/near-surface optical
  properties only. It cannot directly observe subsurface or seafloor
  phenomena (e.g. hydrothermal vents) — deeper causes require
  complementary in-situ or geological evidence.
- The anomaly baseline here is fit per-scene; a production system should
  use a regional/seasonal climatology baseline instead (see
  [`docs/ROADMAP.md`](docs/ROADMAP.md)).

## License

MIT — see [`LICENSE`](LICENSE).
