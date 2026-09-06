# OCEANNOVA

OCEANNOVA is an AI‑Powered Hyperspectral Ocean Anomaly Intelligence system for satellite ocean‑colour data. It detects unusual spectral signatures, ranks likely causes (e.g., algal blooms, suspended sediments, runoff), estimates confidence, and flags true unknowns—turning raw ocean‑colour anomalies into evidence‑backed, reviewable insights for researchers.

Primary languages: TypeScript (84.3%), Python (12.1%), CSS (3.5%), JavaScript (0.1%)

---

## Quick overview

- Detects spectral anomalies in hyperspectral ocean-colour imagery.
- Produces ranked, explainable candidate causes and a confidence score for each detection.
- Designed for reviewable outputs: per-detection evidence, per-band contributions, and exportable reports.
- Intended as a full-stack project: TypeScript for UI/orchestration and Python for ML/data processing.

---

## Key features

- Hyperspectral anomaly detection pipeline (ingest → preprocess → detect → explain → rank).
- Evidence-backed outputs: spectral slices, band contributions, and confidence estimates.
- Ranking of likely causes (e.g., bloom vs. sediment vs. runoff) with explainability artifacts.
- Exportable, reviewable results (JSON/CSV, report generation).
- Designed for batch processing of satellite scenes and for interactive review via a web UI.

---

## Repository composition (from analysis)

- TypeScript: 84.3% — likely front‑end, orchestration, and integration code.
- Python: 12.1% — likely ML, preprocessing, model training/inference.
- CSS / JavaScript: small amounts for UI styling and interop.

---

## Architecture (conceptual)

1. Ingest
   - Satellite hyperspectral data (GeoTIFF / NetCDF / ENVI / HDF5 or other radiance/reflectance cube formats), with geolocation and acquisition metadata.
2. Preprocess
   - Radiometric/atmospheric corrections, masking, band selection, metadata normalization.
3. Detection
   - Spectral anomaly detection (unsupervised and/or supervised) to identify candidate anomalous pixels/regions.
4. Explanation & Ranking
   - Per-candidate spectral attribution, cause-ranking model, uncertainty quantification.
5. Output & Review
   - Structured JSON reports, visualization assets (spectral plots, thumbnails), and a web UI for analyst review.

---

## Prerequisites

- Node.js (LTS recommended; >=16)
- npm, yarn, or pnpm
- Python 3.9+ (3.10+ recommended) and pip
- (Optional) GPU and CUDA drivers if model inference/training uses GPU acceleration
- (Optional) Docker / Docker Compose for reproducible deployment

---

## Getting started — developer quickstart

These steps assume a split repo with a TypeScript frontend/orchestrator and a Python ML/backend component. Adjust directories to your repository layout (e.g., `frontend/`, `web/`, `backend/`, `ml/`).

1. Clone
   - git clone https://github.com/dragunxwho13/OceanNova.git
   - cd OceanNova

2. Frontend / TypeScript (if present)
   - cd frontend        # or the directory where package.json lives
   - npm install        # or yarn / pnpm install
   - npm run dev        # run in development
   - npm run build      # build production bundle
   - npm run start      # start production server (if defined)

3. Python / ML backend (if present)
   - cd backend         # or ml/, models/, or repository root depending on layout
   - python -m venv .venv
   - source .venv/bin/activate   # Windows: .venv\Scripts\activate
   - pip install -r requirements.txt
   - # Example run (adjust to project):
     - uvicorn app.main:app --reload   # if FastAPI
     - or flask --app app run          # if Flask
     - or python -m ocean_nova.entrypoint --help

4. Environment
   - Copy and edit environment template:
     - cp .env.example .env
   - Typical variables:
     - DATA_DIR=/path/to/satellite/data
     - MODEL_PATH=/path/to/model/checkpoint
     - S3_BUCKET=your-bucket
     - LOG_LEVEL=INFO
     - BACKEND_PORT=8000
     - FRONTEND_PORT=3000

5. Docker (optional)
   - If a Dockerfile/docker-compose.yml exists:
     - docker-compose up --build

---

## Input data and expected formats

- Input: hyperspectral ocean‑colour scenes. Supported containers commonly include:
  - GeoTIFF with multiple bands, or ENVI/BSQ style files, or NetCDF/HDF5 scene cubes.
- Each scene should contain:
  - Spatial grid (lat/lon or geospatial transform)
  - Per-band radiance/reflectance values
  - Acquisition metadata (sensor, timestamp, solar/view angles)
- Preprocessing expectations: atmospheric correction and sensor calibration are recommended before detection; the pipeline includes normalization and masking steps but validate against your sensor.

---

## Output format (example)

The system emits structured anomaly reports per scene and per candidate. Example JSON (trimmed):

{
  "scene_id": "SENSOR_20260901_123456",
  "generated_at": "2026-09-06T12:34:56Z",
  "candidates": [
    {
      "id": "cand_0001",
      "geometry": { "type": "Polygon", "coordinates": [ ... ] },
      "pixel_centroid": [lat, lon],
      "spectral_signature": {
        "wavelengths_nm": [400, 410, ...],
        "reflectance": [0.003, 0.004, ...]
      },
      "anomaly_score": 0.97,
      "likely_causes": [
        { "label": "algal_bloom", "score": 0.71 },
        { "label": "suspended_sediment", "score": 0.18 },
        { "label": "runoff", "score": 0.07 }
      ],
      "explanation": {
        "band_contributions": [ {"band": 10, "contribution": 0.32}, ... ],
        "notes": "strong chlorophyll-like peak at 678 nm"
      },
      "evidence_files": {
        "thumbnail_png": "outputs/SENSOR_.../cand_0001_thumb.png",
        "spectral_plot_png": "outputs/.../cand_0001_plot.png"
      }
    }
  ]
}

---

## API (typical endpoints — adapt to your implementation)

- POST /api/v1/detect
  - Body: scene or path to scene
  - Returns: detection report JSON (as above)
- GET /api/v1/status
  - Returns: service health and model versions
- GET /api/v1/results/{id}
  - Returns: saved detection report and artifacts

Use authentication/authorization for production deployments.

---

## Models, training & evaluation (guidance)

- Models may include unsupervised detectors (autoencoders, one-class models), statistical anomaly detectors, and supervised classifiers for cause ranking.
- Keep model checkpoints and training logs out of the repo (use an artifacts bucket).
- Recommended evaluation metrics:
  - Detection: precision, recall, F1, false alarm rate, detection latency
  - Ranking: top‑1 accuracy, top‑k accuracy, calibration (confidence vs. accuracy)
- Use curated labeled scenes for benchmarking and k-fold strategies for limited labels.

---

## Testing

- Frontend: run unit and integration tests (e.g., npm test / yarn test)
- Python: pytest recommended; run tests with:
  - pytest -q
- Add CI that runs linters, unit tests, and sample inference on a small test scene.

---

## Deployment notes

- ML inference can be CPU or GPU accelerated. For production, serve model via a model server (TorchServe, TensorFlow Serving, or FastAPI+Uvicorn with GPU).
- Use object storage (S3 or equivalent) for large scene data and artifacts.
- Use job queues (e.g., Redis/RQ, Celery, or cloud batch) for processing large volumes of scenes.

---

## Security & privacy

- Avoid committing raw satellite scenes and model checkpoints to the repo.
- Secure API endpoints with authentication and rate limiting.
- Sanitize user‑uploaded files and validate input formats.

---

## Contributing

- Fork the repo, create a feature branch, and open a pull request with a clear description and tests.
- Follow the existing style and linting rules for TypeScript and Python.
- Add unit tests and integration tests for any new pipeline components.

---

## License & citation

- Add your license file (e.g., MIT, Apache-2.0). If no license is present, indicate preferred license here.
- When citing OCEANNOVA in publications, include:
  - Project name, repository URL, and a short description of the model and dataset used.

---

## Maintainers / Contact

- Maintainer: dragunxwho13 (GitHub)
- For issues and feature requests: open an issue in this repository.
