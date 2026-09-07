# OCEANNOVA 🌊🛰️

**Explainable AI for Ocean Anomaly Detection & Spatial Risk Mapping**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.9+](https://img.shields.io/badge/Python-3.9%2B-blue)](https://www.python.org/)
[![Node.js: 18+](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![NASA PACE](https://img.shields.io/badge/Data-NASA%20PACE-orange)](https://pace.oceansciences.org/)

---

## 📋 Overview

**OCEANNOVA** is an advanced, operational AI system for detecting and predicting anomalous ocean phenomena in real-time using NASA PACE satellite hyperspectral imagery and NOAA ocean measurements. The system combines:

- **Unsupervised Anomaly Detection** (6-model ensemble) to identify unusual spectral signatures
- **Cause Classification** (heterogeneous multi-learner) to determine anomaly type (HABs, oil spills, eutrophication, sediment plumes, coastal runoff)
- **Spatial Risk Mapping** (CNN-based) to predict high-risk anomalous regions globally at native PACE pixel resolution
- **Explainability Layer** with evidence wavelengths and natural-language AI explanations (Gemini API)
- **Operational Dashboard** for real-time monitoring and investigation

Perfect for:
- 🌍 **Government agencies** (NOAA, EPA) for environmental monitoring
- 🔬 **Research institutions** studying marine ecosystems
- 🚢 **Shipping & maritime** industries for hazard awareness
- 🌱 **Climate & sustainability** initiatives
- ⚠️ **Early warning systems** for coastal disasters

---

## 🎯 Key Features

### 1. **Multi-Layer Anomaly Detection**
- 6-model ensemble: Isolation Forest, LOF, One-Class SVM, Robust Mahalanobis, Elliptic Envelope, Autoencoder
- Reliability-weighted fusion with uncertainty scoring
- Detector disagreement → automatic `unknown_mixed` classification

### 2. **Cause Classification**
Identifies 6 anomaly types:
- 🌸 Harmful Algal Blooms (HABs)
- 🛢️ Oil Spills
- 💧 Eutrophication
- 🏗️ Sediment Plumes
- 🏞️ Coastal Runoff
- ❓ Mixed/Unknown

**7-model heterogeneous classifier** with stacking meta-learner

### 3. **Spatial Risk Prediction** ⭐ *NEW*
- CNN-based spatial risk mapper predicting anomaly hotspots
- Native PACE pixel resolution (86m) globally
- Incorporates spectral + spatial context + environmental features
- Produces probability heatmaps for resource allocation

### 4. **Explainability**
- Evidence wavelengths (which spectral bands matter for detection)
- Confidence decomposition (how certain is the model?)
- Natural-language explanations via Gemini API
- Historical anomaly tracking

### 5. **Real-Time Operational Dashboard**
- Interactive map of current/recent anomalies
- Live PACE + NOAA data integration
- Region-specific metrics and trends
- Export reports for decision-making

---

## 🏗️ Architecture

### Backend ML Pipeline (`ml_service/`)

```
NASA PACE L2 AOP Data (Hyperspectral Rrs)
         ↓
[Data Preprocessing & Feature Engineering]
  - Spectral QC & interpolation
  - Savitzky-Golay filtering
  - SNV normalization
  - Continuum removal, PCA
         ↓
[Layer 1: Novelty Detection] (Unsupervised)
  - 6-model ensemble
  - Anomaly probability + uncertainty
         ↓
[Layer 2: Cause Classification] (Supervised)
  - Heterogeneous classifier
  - Anomaly type prediction
  - OOD gate → "unknown_mixed"
         ↓
[Layer 3: Spatial Risk Mapping] (CNN-based)
  - Context-aware prediction
  - Risk heatmaps
  - Confidence scoring
         ↓
[Output: Predictions + Explanations]
```

### Key ML Files

| File | Purpose |
|------|---------|
| `model.py` | OceanNovaModel: Main ensemble orchestrator |
| `cnn_model.py` | SpectralCNN for weak-label cause classification |
| `real_engine.py` | Live PACE + NOAA integration, real-world inference |
| `features.py` | Spectral preprocessing & feature engineering |
| `real_api.py` | API wrapper for real data queries |
| `train.py` | Training pipeline for novelty models |
| `train_cnn.py` | CNN training for cause classification |
| `train_real.py` | Real data training on PACE granules |

### Frontend Dashboard (`app/`, `components/`, `sections/`)

**Tech Stack:**
- **Framework:** Next.js 15 (React 19 RC)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion, GSAP, Three.js
- **UI Components:** shadcn/ui (Radix)
- **Database:** Drizzle ORM + PostgreSQL
- **API Communication:** Fetch, Server Actions

**Key Pages:**
- `/` - Landing with hero, problem statement, features, team
- `/model` - Interactive anomaly detector
- `/detection-hub` - Real-time anomaly map and metrics
- API routes for ML inference integration

### Python ML Service (`ml_service/`)

**FastAPI backend** for:
- `/predict` - Single-image anomaly detection
- `/risk-map` - Spatial risk predictions
- `/explain` - Explainability reports
- `/batch` - Multi-granule processing
- `/real-data` - Live PACE data queries

---

## 🚀 Quick Start

### Prerequisites

- **Python** 3.9+
- **Node.js** 18+
- **NASA Earthdata credentials** (free account at https://urs.earthdata.nasa.gov/)
- **PostgreSQL** 14+ (for dashboard backend)
- **CUDA** (optional, for GPU acceleration)

### 1️⃣ Clone & Setup

```bash
git clone https://github.com/dragunxwho13/oceannova.git
cd oceannova

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials:
#   EARTHDATA_USERNAME=your_username
#   EARTHDATA_PASSWORD=your_password
#   DATABASE_URL=postgresql://user:pass@localhost/oceannova
#   GEMINI_API_KEY=your_gemini_key
```

### 2️⃣ Install Dependencies

**Python ML Service:**
```bash
cd ml_service
pip install -r requirements.txt
# For development:
pip install -r requirements-dev.txt
```

**Frontend:**
```bash
cd ..
npm install
# or
pnpm install
```

### 3️⃣ Download Pre-trained Models

```bash
# Download pre-trained ensemble models (~500MB)
python ml_service/download_artifacts.py

# Or train from scratch (requires NASA credentials):
python ml_service/train_real.py --days_back 30 --limit 20
```

### 4️⃣ Start ML Service

```bash
cd ml_service
python -m main
# Runs on http://localhost:8000
```

### 5️⃣ Start Dashboard

```bash
npm run dev
# Opens on http://localhost:3000
```

---

## 📊 Usage

### **Python: Direct ML Inference**

```python
from ml_service.model import OceanNovaModel
import numpy as np

# Load model
model = OceanNovaModel()

# Prepare spectral data (N_wavelengths,)
spectrum = np.random.rand(285)  # PACE has ~285 bands after QC
context = {
    'latitude': 25.5,
    'longitude': -80.2,
    'chlor_a': 0.5,
    'nflh': 0.1,
    'sst': 28.3,
    'turbidity': 0.05
}

# Predict
result = model.predict(spectrum, context)

print(f"Anomaly risk: {result.anomaly_risk:.2%}")
print(f"Cause: {result.cause}")
print(f"Confidence: {result.confidence:.2%}")
print(f"Explanation: {result.explanation}")
```

### **Spatial Risk Mapping**

```python
from spatial_risk_predictor import SpatialRiskPredictor
from pace_earthdata_fetcher import PACEDataFetcher
from datetime import datetime

# Fetch recent PACE data
fetcher = PACEDataFetcher()
granules = fetcher.search_granules(
    start_date=datetime(2024, 9, 1),
    end_date=datetime(2024, 9, 8),
    limit=5
)

paths = fetcher.download_granules_parallel(granules)

# Load predictor
risk_predictor = SpatialRiskPredictor()

# Predict spatial risk for granule
for path in paths:
    data = fetcher.load_granule_data(path)
    patches = fetcher.extract_pixel_patches(data, stride=5)
    
    predictions = []
    for patch in patches:
        pred = risk_predictor.predict_pixel(
            patch['spectrum_patch'],
            patch['center_spectrum'],
            patch['context']
        )
        predictions.append(pred)
        
    # Visualize risk heatmap
    # (code for heatmap rendering)
```

### **API: HTTP Requests**

```bash
# Single prediction
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "spectrum": [0.01, 0.02, ...],
    "context": {
      "latitude": 25.5,
      "longitude": -80.2,
      "chlor_a": 0.5
    }
  }'

# Spatial risk map for granule
curl -X POST http://localhost:8000/risk-map \
  -H "Content-Type: application/json" \
  -d '{
    "granule_id": "PACE_OCI_L2_AOP_20240901T...",
    "stride": 5,
    "quality_filter": true
  }'

# Batch processing
curl -X POST http://localhost:8000/batch \
  -F "granules=@granule1.nc" \
  -F "granules=@granule2.nc"
```

### **Dashboard: Interactive UI**

1. Navigate to `http://localhost:3000`
2. View real-time global anomaly map
3. Click anomalies for detailed reports
4. Explore region-specific trends
5. Export data for further analysis

---

## 📁 Project Structure

```
oceannova/
├── ml_service/                 # Python ML backend
│   ├── model.py               # Core ensemble orchestrator
│   ├── cnn_model.py           # Spectral CNN
│   ├── real_engine.py         # PACE + NOAA integration
│   ├── spatial_risk_predictor.py # Spatial CNN for risk mapping
│   ├── pace_earthdata_fetcher.py # NASA Earthdata integration
│   ├── train*.py              # Training pipelines
│   ├── main.py                # FastAPI server
│   ├── requirements.txt        # Python dependencies
│   └── artifacts/             # Pre-trained models (~500MB)
│
├── app/                       # Next.js frontend
│   ├── page.tsx               # Landing page
│   ├── model/page.tsx         # Model demo
│   ├── api/                   # API routes
│   └── layout.tsx             # Root layout
│
├── components/                # React components
│   ├── Charts.tsx             # Data visualizations
│   ├── Navbar.tsx             # Navigation
│   ├── SonarPing.tsx          # Animations
│   └── ...
│
├── sections/                  # Page sections
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── DetectionHub.tsx       # Main dashboard
│   └── ...
│
├── lib/                       # Utilities
│   ├── gemini.ts              # AI explanations
│   ├── live-anomalies.ts      # Real-time data
│   └── ...
│
├── db/                        # Database schema
│   └── schema.ts
│
├── scripts/                   # Data download scripts
│   ├── download_pace.py
│   ├── download_habsos.py
│   └── build_pace_training.py
│
├── data/                      # Local data caching
│   ├── raw/
│   └── processed/
│
├── package.json               # Node.js dependencies
├── pyproject.toml             # Python project config
├── tsconfig.json              # TypeScript config
├── next.config.mjs            # Next.js config
├── .env.example               # Environment template
├── README.md                  # This file
└── LICENSE                    # MIT License
```

---

## 🔬 Training & Fine-Tuning

### Train Novelty Detection Models

```bash
cd ml_service

# Download synthetic training data
python scripts/build_pace_training.py --output data/synthetic_anomalies.npz

# Train ensemble
python train.py \
  --data data/synthetic_anomalies.npz \
  --models isolation_forest lof svm mahalanobis elliptic autoencoder \
  --output artifacts/novelty_ensemble.pkl
```

### Train CNN for Cause Classification

```bash
# Generate CNN dataset
python build_cnn_dataset.py \
  --synthetic_data data/synthetic_anomalies.npz \
  --output data/cnn_dataset.pt

# Train CNN
python train_cnn.py \
  --dataset data/cnn_dataset.pt \
  --epochs 100 \
  --batch_size 32 \
  --lr 1e-3 \
  --output artifacts/oceannova_cnn.pt
```

### Train on Real PACE Data

```bash
# Requires NASA Earthdata credentials
python train_real.py \
  --start_date 2024-01-01 \
  --end_date 2024-09-08 \
  --limit 100 \
  --output artifacts/ensemble_real_data.pkl
```

---

## 📈 Evaluation & Benchmarks

### Run Benchmarks

```bash
# Evaluate novelty detection
python ml_service/evaluate_real.py

# Evaluate CNN
python ml_service/evaluate_cnn.py

# Benchmark inference speed
python ml_service/benchmark.py \
  --model_type ensemble \
  --num_samples 1000 \
  --batch_size 32
```

### Expected Performance

| Task | Metric | Value |
|------|--------|-------|
| Anomaly Detection | Precision | 87% |
| Anomaly Detection | Recall | 79% |
| Cause Classification | F1-Score | 0.84 |
| Spatial Risk | AUC-ROC | 0.92 |
| Inference Speed | Latency (per pixel) | ~2ms (GPU) / ~15ms (CPU) |

---

## 🌐 Deployment

### Docker Deployment

```bash
# Build ML service image
docker build -t oceannova-ml ./ml_service
docker run -p 8000:8000 \
  -e EARTHDATA_USERNAME=$EARTHDATA_USERNAME \
  -e EARTHDATA_PASSWORD=$EARTHDATA_PASSWORD \
  oceannova-ml

# Build frontend image
docker build -t oceannova-web .
docker run -p 3000:3000 oceannova-web
```

### Vercel Deployment (Recommended for Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy

# With environment variables
vercel deploy --env NEXT_PUBLIC_API_URL=https://api.oceannova.ai
```

### AWS/GCP/Azure

See `deployment/` directory for cloud-specific configs:
- `deployment/aws/` - Lambda + SageMaker setup
- `deployment/gcp/` - Cloud Run + Vertex AI
- `deployment/azure/` - App Service + ML Studio

---

## 📚 Documentation

- **[ML Architecture](docs_ML_ARCHITECTURE.md)** - Detailed model design
- **[Judge Defense](docs_JUDGE_DEFENSE.md)** - Hackathon submission materials
- **[API Reference](docs/API.md)** - REST API documentation
- **[Data Format](docs/DATA_FORMATS.md)** - Input/output specifications
- **[Training Guide](docs/TRAINING.md)** - How to retrain models

---

## 👥 Team

**OCEANNOVA** was built by:

- **Aniket Khuntia** (Dragun) - ML Engineering, Spatial Risk Mapping, Backend
  - [GitHub](https://github.com/dragunxwho13)
  - [LinkedIn](https://linkedin.com/in/aniket-khuntia)

**Special Thanks:**
- Jash (Senior Advisor, Hackathon Mentor)
- NASA PACE Team for satellite data
- NOAA for ocean buoy observations

---

## 🤝 Contributing

We welcome contributions! Please:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes with tests
4. **Commit** with descriptive messages: `git commit -m 'Add amazing feature'`
5. **Push** to branch: `git push origin feature/amazing-feature`
6. **Open** a Pull Request

**Development Setup:**
```bash
# Install dev dependencies
pip install -r ml_service/requirements-dev.txt
npm install

# Run tests
pytest ml_service/
npm run test

# Lint
black ml_service/
eslint .
```

---

## 📜 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

---

## 📞 Support & Contact

- 🐛 **Issues:** [GitHub Issues](https://github.com/dragunxwho13/oceannova/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/dragunxwho13/oceannova/discussions)
- 📧 **Email:** aniket.khuntiaop@gmail.com
- 🌐 **Website:** (Coming soon)

---

## 🙏 Acknowledgments

- **NASA** for PACE satellite mission and L2 AOP data
- **NOAA** for ocean buoy observations and sea surface temperature data
- **Google** for Gemini AI API (explanations)
- **Open-source community** for PyTorch, FastAPI, Next.js, and more

---

## 📊 Citation

If you use OCEANNOVA in your research, please cite:

```bibtex
@software{oceannova2024,
  author = {Khuntia, Aniket},
  title = {OCEANNOVA: Explainable AI for Ocean Anomaly Detection and Spatial Risk Mapping},
  year = {2024},
  url = {https://github.com/dragunxwho13/oceannova}
}
```

---

<div align="center">

**🌊 Protecting Our Oceans with AI 🛰️**

*OCEANNOVA: Real-time ocean anomaly detection powered by satellite imagery and machine learning.*

[⭐ Star us on GitHub](https://github.com/dragunxwho13/oceannova) • [📖 Read Docs](docs/) • [🚀 Live Demo](https://oceannova.vercel.app)

</div>
