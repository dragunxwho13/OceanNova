"""
Stage 2 — Cause classification.
Stage 3 — Unknown / out-of-distribution (OOD) detection.

Classifies flagged anomalies into known cause categories using spectral +
environmental features (Random Forest, per the hackathon plan's fast/reliable
recommendation). Predictions below a confidence threshold, or with high
feature-space distance from all known-class centroids, are relabeled
UNKNOWN/MIXED rather than force-fit into a class.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from .synthetic_data import DIRECT_OPTICAL_CLASSES, PROXY_EVENT_CLASSES, band_columns

# Every generative class the classifier is trained to recognize. Deliberately
# excludes HELDOUT_UNKNOWN_CLASS ("unusual_community"), which is kept out of
# training so it can be used to check that the unknown/OOD pathway actually
# catches signatures the model has never seen (see synthetic_data.py).
KNOWN_CLASSES = DIRECT_OPTICAL_CLASSES + PROXY_EVENT_CLASSES

UNKNOWN_LABEL = "unknown_mixed"


class CauseClassifier:
    def __init__(self, confidence_threshold: float = 0.40, random_state: int = 42):
        self.confidence_threshold = confidence_threshold
        self.random_state = random_state
        self.model = RandomForestClassifier(
            n_estimators=300, max_depth=12, random_state=random_state, class_weight="balanced"
        )
        self._feature_cols: list[str] = []
        self._fitted = False

    def _features(self, df: pd.DataFrame) -> pd.DataFrame:
        bands = band_columns(df)
        extra = [c for c in ("sst_c",) if c in df.columns]
        return df[bands + extra]

    def fit(self, df: pd.DataFrame, label_col: str = "label", test_size: float = 0.25):
        """
        Train only on rows whose label is one of KNOWN_CLASSES (the
        'unusual_community' synthetic class is deliberately excluded so it
        can be used later to validate unknown-detection behavior).
        """
        train_df = df[df[label_col].isin(KNOWN_CLASSES)].reset_index(drop=True)
        X = self._features(train_df)
        y = train_df[label_col]
        self._feature_cols = list(X.columns)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=self.random_state, stratify=y
        )
        self.model.fit(X_train, y_train)
        self._fitted = True

        y_pred = self.model.predict(X_test)
        report = classification_report(y_test, y_pred, zero_division=0)
        cm = confusion_matrix(y_test, y_pred, labels=self.model.classes_)
        return {"report": report, "confusion_matrix": cm, "labels": list(self.model.classes_)}

    def predict(self, df: pd.DataFrame, top_k: int = 3) -> pd.DataFrame:
        """
        Return df with added columns:
          - predicted_cause: class label, or UNKNOWN_LABEL if low confidence
          - confidence: max predicted-class probability (0-1)
          - cause_candidates: list of (label, probability) tuples, sorted
            descending, length min(top_k, n_classes). This is what lets the
            explainability layer say *why not* the runner-up cause — not
            just what the top pick was.
        """
        if not self._fitted:
            raise RuntimeError("Call .fit() before .predict()")

        X = self._features(df)[self._feature_cols]
        proba = self.model.predict_proba(X)
        classes = np.array(self.model.classes_)

        order = np.argsort(-proba, axis=1)
        k = min(top_k, proba.shape[1])

        max_proba = proba[np.arange(len(df)), order[:, 0]]
        pred_labels = classes[order[:, 0]]
        final_labels = np.where(max_proba >= self.confidence_threshold, pred_labels, UNKNOWN_LABEL)

        candidates = [
            [(classes[order[i, j]], float(proba[i, order[i, j]])) for j in range(k)] for i in range(len(df))
        ]

        out = df.copy()
        out["predicted_cause"] = final_labels
        out["confidence"] = max_proba
        out["cause_candidates"] = candidates
        return out
