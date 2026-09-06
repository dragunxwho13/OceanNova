# OCEANNOVA — Architecture

```
PACE hyperspectral data (+ NOAA / ISRO context, optional)
        │
        ▼
Quality control  (drop invalid / cloud / land / glint pixels)
        │
        ├──────────────────────────────┐
        ▼                              ▼
Spectral preprocessing          Raw (QC'd) reflectance + SST
(L2-normalize shape,            — fed to the classifier, unchanged
 derivative features)             in units, at both fit and predict
        │                          time (see note below)
        ▼                              │
Stage 1 — Anomaly detection            │
(PCA + Isolation Forest)               │
        │   → anomaly_score (0-100),   │
        │     is_anomaly flag          │
        │                              ▼
        │                     Stage 2 — Cause classification
        │                     (Random Forest on spectral + env features)
        │                        → predicted_cause, confidence
        │                              │
        └──────────────┬───────────────┘
                        ▼
Stage 3 — Unknown / OOD detection   (confidence threshold on Stage 2)
        │   → low-confidence predictions relabeled `unknown_mixed`
        ▼
Explainability (explain.py) — four separate questions, not one blob:
        │   1. observed_behavior  — plain-language readout of the measured
        │                           spectral shift + SST anomaly (no cause attached yet)
        │   2. reasoning          — why that behavior points to predicted_cause,
        │                           naming the runner-up cause_candidates that was ruled out
        │   3. future_outlook     — static, cause-level recurrence narrative;
        │                           "Unknown" for geophysical causes (earthquake,
        │                           volcanic, tsunami) since ocean-colour/SST can't assess those
        │   4. similar_risk_areas — nearest-neighbour search in feature space for
        │                           other below-threshold pixels showing an early/
        │                           partial version of the same pattern
        ▼
Interactive map + evidence card  (Streamlit + Plotly)
```

## Module map

| Module | Responsibility |
|---|---|
| `synthetic_data.py` | Generates PACE-shaped demo data so the pipeline runs offline before real data is wired in |
| `io_pace.py` | Stub loader for real PACE OCI L2 NetCDF granules (Earthdata) — implement when ready |
| `preprocessing.py` | QC, spectral normalization, derivative features |
| `anomaly.py` | Stage 1 — `AnomalyDetector` (PCA + Isolation Forest) |
| `classifier.py` | Stage 2 + 3 — `CauseClassifier` (Random Forest + confidence-threshold UNKNOWN); `predict()` also returns top-k `cause_candidates` (runner-up causes + probabilities) for explainability |
| `explain.py` | Builds baseline spectrum + per-pixel `EvidenceCard`: observed behavior, causal reasoning (with runner-up), static per-cause future risk outlook, and a similar-risk-area finder. Also holds `NOT_DETECTABLE_BY_THIS_PIPELINE` — events (e.g. tectonic plate shifts) with no ocean-colour/SST signature at all, documented as "Unknown" rather than guessed at |
| `pipeline.py` | Wires all stages together end-to-end; runnable as a script |
| `app/streamlit_app.py` | Interactive map + spectrum comparison + evidence card UI |

**Important:** the anomaly detector and the cause classifier deliberately use
*different* feature spaces — normalized spectral shape for the former, raw
(QC'd) reflectance + SST for the latter — and each must be fit and predicted
on the space it was trained in. Feeding the classifier normalized data at
predict time when it was trained on raw data doesn't raise an error; it
silently collapses nearly every prediction onto whichever class its
raw-trained thresholds are least discriminating about. `pipeline.py` and
`app/streamlit_app.py` both derive the classifier's fit/predict inputs from
the same QC'd raw dataframe, in the same row order, specifically to avoid
this.

## Cause taxonomy

| Tier | Classes | Ocean colour can... |
|---|---|---|
| Direct optical | `phytoplankton_bloom`, `red_tide`, `turbidity`, `sediment_plume`, `sediment_intrusion`, `cdom_terrestrial`, `oil_spill` | ...plausibly detect these fairly directly — they change surface optical properties |
| Proxy event | `volcanic_eruption`, `earthquake_seismic`, `tsunami`, `heatwave_ecosystem`, `unusual_current_disturbance` | ...only see a secondary optical/thermal effect that *might* be associated with the event — never the event itself |
| Held out | `unusual_community` | Excluded from training entirely; used to validate that the unknown/OOD pathway catches signatures the model has never seen |
| Assigned at inference | `unknown_mixed` | Not a generative class — assigned whenever classifier confidence falls below threshold |

Every proxy-event prediction is flagged in the evidence card as a proxy
signature, not a direct detection, with a recommendation to cross-check
against independent data (seismic catalogs, tide gauges, thermal imagery).

## Explainability design — behavior vs. reason vs. future

Every evidence card deliberately keeps four things separate rather than
folding them into one paragraph, because they're answering different
questions and mixing them makes it easy to overclaim:

1. **Observed behavior** — a plain-language readout of the measured data
   only (which wavelengths moved, by how much, and the SST anomaly). No
   causal interpretation attached at this stage.
2. **Reasoning** — why that behavior points to `predicted_cause` rather than
   the runner-up the classifier considered (`cause_candidates[1]`). This is
   the "why did/does this happen" answer for something already observed.
3. **Future outlook** — a static, cause-*level* recurrence narrative (e.g.
   phytoplankton blooms recur under sustained warm SST + nutrient input).
   This is explicitly **not** a forecast for the specific flagged pixel —
   the pipeline has no time-series data to forecast from. For earthquake,
   volcanic, and tsunami causes this is hard-coded to **"Unknown / requires
   external data"**, because ocean-colour reflectance and SST cannot assess
   seismic or tectonic recurrence risk under any circumstance — that would
   need real seismic network data (e.g. USGS), not a spectral heuristic.
4. **Similar risk areas** — a separate spatial answer to "where else could
   this happen": a nearest-neighbour search (`find_similar_risk_areas`) over
   the rest of the scene's pixels in normalized band+SST feature space,
   restricted to pixels that stayed *below* the anomaly threshold. These are
   early/borderline matches to the same signature, not just other pixels
   that already got the same label.

**Events with no signature at all.** Some things a reviewer might ask about
have no ocean-colour or SST proxy whatsoever — a tectonic plate shift itself
(as opposed to an earthquake it might cause) is the clearest example. These
live in `NOT_DETECTABLE_BY_THIS_PIPELINE` and are surfaced in the UI sidebar
so the honest answer is "Unknown, here's why" rather than silence or a
fabricated guess.

## Design choices (per the hackathon plan)

- **Isolation Forest over autoencoder**: faster to train/tune within a hackathon
  timeframe, no GPU needed, robust to the moderate dimensionality after PCA.
- **Random Forest over deep learning for classification**: interpretable,
  fast, and the plan explicitly recommends against a from-scratch neural net
  for the MVP (see "What NOT to Build" in the hackathon plan).
- **Confidence-threshold UNKNOWN, not a learned OOD model**: simplest
  reliable way to implement "flag the unknown" without needing a large
  labeled OOD dataset. Swap in a distance-based OOD check (e.g. Mahalanobis
  distance to class centroids) as a stretch goal — see `docs/ROADMAP.md`.
- **Synthetic data first**: guarantees the full pipeline (and demo) works
  before real PACE data is downloaded and debugged, de-risking the
  hackathon timeline per Section 14 of the plan.

## Known limitations (be upfront about these in the demo)

- Synthetic training data is cleanly separable by construction, so
  classifier metrics on it are not representative of real-world performance.
  Real PACE + ground-truth (HAB bulletins, spill reports) data should be
  used for actual validation.
- Satellite hyperspectral data observes ocean-surface/near-surface optical
  properties only — it cannot directly observe subsurface or seafloor
  phenomena. Deeper causes require complementary in-situ or geological
  evidence (see hackathon plan, Section 13).
- The anomaly detector's baseline is fit per-scene in this scaffold; a
  production system should use a regional/seasonal climatology baseline
  instead (see `docs/ROADMAP.md`, Phase 2+).
