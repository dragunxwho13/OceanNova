# Roadmap

- **Phase 1** — PACE + NOAA, one region (Arabian Sea / Bay of
  Bengal), 3-4 known cause classes + unknown, synthetic-data pipeline
  working end-to-end.
- **Phase 2** — Wire in real PACE OCI L2 data via `io_pace.py`; add ISRO
  Oceansat-3 (EOS-06), Sentinel-3, VIIRS/MODIS as additional data sources
  and cross-validation layers.
- **Phase 3** — Incorporate Argo floats, buoy data, ship-based and
  biological observations for stronger ground truth and richer
  environmental context features.
- **Phase 4** — Continuous anomaly monitoring with near-real-time alerts as
  new PACE granules become available.
- **Phase 5** — Feedback loop from expert/scientist validation and field
  observations to improve classifier and OOD detection over time.

## Near-term technical stretch goals

- Replace the per-scene anomaly baseline with a regional/seasonal
  climatology baseline (requires accumulating multiple scenes over time).
- Replace confidence-threshold UNKNOWN detection with a proper
  distance-based OOD method (e.g. Mahalanobis distance to class centroids
  in PCA space, or a reconstruction-error autoencoder).
- Add a lightweight FastAPI inference endpoint (see hackathon plan's
  "Production-style" tech stack option) so the Streamlit frontend calls a
  real backend instead of running the pipeline in-process.
