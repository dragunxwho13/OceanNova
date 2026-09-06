"""
Stage 1 — Anomaly detection.

Learns what "normal" ocean spectral signatures look like for the scene/region
and scores every pixel's deviation from that baseline. Uses Isolation Forest
by default (fast, robust, no distributional assumptions) with PCA
dimensionality reduction first, per the hackathon plan's recommended
Option 1 stack.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from .synthetic_data import band_columns


class AnomalyDetector:
    def __init__(self, n_components: int = 10, contamination: float = 0.15, random_state: int = 42):
        self.n_components = n_components
        self.contamination = contamination
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=n_components, random_state=random_state)
        self.model = IsolationForest(contamination=contamination, random_state=random_state)
        self._fitted = False

    def fit(self, df: pd.DataFrame) -> "AnomalyDetector":
        bands = band_columns(df)
        X = self.scaler.fit_transform(df[bands])
        X_pca = self.pca.fit_transform(X)
        self.model.fit(X_pca)
        self._fitted = True
        return self

    def score(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Return df with two added columns:
          - anomaly_score: 0-100, higher = more anomalous
          - is_anomaly: bool flag using the fitted contamination threshold
        """
        if not self._fitted:
            raise RuntimeError("Call .fit() before .score()")

        bands = band_columns(df)
        X = self.scaler.transform(df[bands])
        X_pca = self.pca.transform(X)

        # decision_function: higher = more normal. Invert + rescale to 0-100.
        raw = self.model.decision_function(X_pca)
        raw_min, raw_max = raw.min(), raw.max()
        span = (raw_max - raw_min) or 1.0
        anomaly_score = 100 * (1 - (raw - raw_min) / span)

        out = df.copy()
        out["anomaly_score"] = anomaly_score
        out["is_anomaly"] = self.model.predict(X_pca) == -1
        return out
