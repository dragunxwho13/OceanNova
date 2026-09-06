"""
End-to-end OCEANNOVA pipeline runner.

    QC/preprocess -> anomaly detection -> cause classification
    -> unknown detection -> evidence cards

Run directly: `python -m oceannova.pipeline`

IMPORTANT: the anomaly detector and the cause classifier deliberately use
*different* feature spaces, and each must be fit and predicted on the same
space it was trained in:

  - AnomalyDetector operates on L2-normalized spectral *shape* (see
    preprocessing.normalize_spectra) plus derivative features, so it
    reacts to the shape of a pixel's spectrum, not its absolute brightness.
  - CauseClassifier operates on raw (QC'd, un-normalized) reflectance plus
    SST, since the class-specific perturbations and their magnitude/SST
    context are what encode "which known cause looks like this."

Feeding the classifier normalized bands at predict time when it was trained
on raw bands (or vice versa) silently breaks its decision boundaries — the
model doesn't error, it just predicts a distribution it saw at training
time regardless of what's really in front of it, which in practice collapses
predictions onto whichever class its raw-trained thresholds are least picky
about. Both dataframes below are derived from the same QC'd `raw_clean` in
the same row order specifically to avoid that trap.
"""

from __future__ import annotations

import pandas as pd

from .anomaly import AnomalyDetector
from .classifier import CauseClassifier
from .explain import build_baseline, explain_pixel
from .preprocessing import add_derivative_features, normalize_spectra, quality_control
from .synthetic_data import generate_scene


def run_pipeline(n_samples: int = 2000, seed: int = 42) -> dict:
    print("[1/6] Generating scene data...")
    raw = generate_scene(n_samples=n_samples, seed=seed)

    print("[2/6] Quality control...")
    raw_clean = quality_control(raw)  # raw units, QC'd — classifier trains/predicts on this

    print("[3/6] Spectral preprocessing (normalize + derivatives) for anomaly detection...")
    processed = add_derivative_features(normalize_spectra(raw_clean))  # shape space — anomaly detector only

    print("[4/6] Fitting anomaly detector...")
    detector = AnomalyDetector()
    detector.fit(processed)
    scored = detector.score(processed)

    print("[5/6] Fitting cause classifier...")
    classifier = CauseClassifier()
    eval_results = classifier.fit(raw_clean)
    class_pred = classifier.predict(raw_clean)

    # scored and class_pred both derive from raw_clean in the same row order,
    # so a plain column assignment (not a join/merge) keeps everything aligned.
    predicted = scored.copy()
    predicted["predicted_cause"] = class_pred["predicted_cause"].to_numpy()
    predicted["confidence"] = class_pred["confidence"].to_numpy()
    predicted["cause_candidates"] = class_pred["cause_candidates"].to_numpy()

    print("[6/6] Building evidence cards for top anomalies...")
    # Baseline must come from the same (normalized) feature space as the
    # scored/predicted pixels, or percent-deviation comparisons are meaningless.
    baseline = build_baseline(processed[raw_clean["label"] == "normal"])
    top_anomalies = predicted[predicted["is_anomaly"]].sort_values("anomaly_score", ascending=False).head(5)
    # full_df=predicted lets each card also surface similar_risk_areas — other
    # pixels in the same scene with a close-but-below-threshold match.
    cards = [explain_pixel(row, baseline, full_df=predicted) for _, row in top_anomalies.iterrows()]

    return {
        "raw": raw_clean,
        "processed": processed,
        "scored": predicted,
        "classifier_eval": eval_results,
        "evidence_cards": cards,
    }


if __name__ == "__main__":
    results = run_pipeline()

    print("\n=== Classifier evaluation (held-out test set) ===")
    print(results["classifier_eval"]["report"])

    print("=== Cause distribution across scene ===")
    print(results["scored"]["predicted_cause"].value_counts())

    print("\n=== Top 5 anomalies — evidence cards ===")
    for card in results["evidence_cards"]:
        print("-", card.summary())
        print(f"    Behavior: {card.observed_behavior}")
        print(f"    Reasoning: {card.reasoning}")
        print(f"    Future outlook: {card.future_outlook}")
        if card.similar_risk_areas:
            areas = ", ".join(f"({a['lat']:.2f}, {a['lon']:.2f})" for a in card.similar_risk_areas[:3])
            print(f"    Similar-risk areas to watch: {areas}")

    out_path = "data/processed/scored_scene.csv"
    results["scored"].to_csv(out_path, index=False)
    print(f"\nFull scored scene written to {out_path}")
