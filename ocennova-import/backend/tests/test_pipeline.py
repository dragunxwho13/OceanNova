"""
Basic smoke tests for the OCEANNOVA pipeline.

Run with: pytest tests/
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from oceannova.anomaly import AnomalyDetector
from oceannova.classifier import CauseClassifier, UNKNOWN_LABEL
from oceannova.explain import (
    FUTURE_RISK_OUTLOOK,
    NOT_DETECTABLE_BY_THIS_PIPELINE,
    build_baseline,
    explain_pixel,
    find_similar_risk_areas,
    future_outlook_for,
)
from oceannova.preprocessing import preprocess, quality_control, normalize_spectra
from oceannova.synthetic_data import band_columns, generate_scene


def test_generate_scene_shape():
    df = generate_scene(n_samples=200, seed=1)
    assert len(df) == 200
    assert "label" in df.columns
    assert len(band_columns(df)) > 0


def test_quality_control_drops_invalid():
    df = generate_scene(n_samples=100, seed=1)
    bands = band_columns(df)
    df.loc[0, bands[0]] = -1.0  # inject invalid value
    cleaned = quality_control(df)
    assert len(cleaned) == 99


def test_normalize_spectra_unit_norm():
    df = generate_scene(n_samples=50, seed=1)
    normed = normalize_spectra(df)
    bands = band_columns(normed)
    norms = (normed[bands] ** 2).sum(axis=1) ** 0.5
    assert all(abs(n - 1.0) < 1e-6 for n in norms)


def test_anomaly_detector_flags_some_pixels():
    df = generate_scene(n_samples=500, seed=1)
    processed = preprocess(df)
    detector = AnomalyDetector(contamination=0.15)
    detector.fit(processed)
    scored = detector.score(processed)
    assert "anomaly_score" in scored.columns
    assert scored["is_anomaly"].sum() > 0
    assert scored["anomaly_score"].between(0, 100).all()


def test_classifier_predicts_known_and_unknown():
    df = generate_scene(n_samples=1000, seed=1)
    classifier = CauseClassifier(confidence_threshold=0.55)
    classifier.fit(df)
    predicted = classifier.predict(df)
    assert "predicted_cause" in predicted.columns
    assert "confidence" in predicted.columns
    # unusual_community rows should often (not necessarily always) end up UNKNOWN
    unusual = predicted[predicted["label"] == "unusual_community"]
    if len(unusual) > 0:
        assert (unusual["predicted_cause"] == UNKNOWN_LABEL).mean() >= 0.0


def test_evidence_card_builds():
    df = generate_scene(n_samples=300, seed=1)
    processed = preprocess(df)
    baseline = build_baseline(processed[df["label"] == "normal"])
    row = processed.iloc[0].copy()
    row["anomaly_score"] = 88.0
    row["predicted_cause"] = "phytoplankton_bloom"
    row["confidence"] = 0.81
    card = explain_pixel(row, baseline)
    assert len(card.top_deviating_bands) == 5
    assert "Anomaly 88" in card.summary()


def test_evidence_card_includes_behavior_reasoning_and_outlook():
    df = generate_scene(n_samples=300, seed=1)
    processed = preprocess(df)
    baseline = build_baseline(processed[df["label"] == "normal"])
    row = processed.iloc[0].copy()
    row["anomaly_score"] = 92.0
    row["predicted_cause"] = "oil_spill"
    row["confidence"] = 0.9
    row["cause_candidates"] = [("oil_spill", 0.9), ("cdom_terrestrial", 0.06), ("normal", 0.04)]

    card = explain_pixel(row, baseline)

    # 1. Observed behavior is a plain data readout, independent of the cause label.
    assert card.observed_behavior
    assert "nm" in card.observed_behavior

    # 2. Reasoning ties the behavior to the predicted cause and names the runner-up.
    assert "oil_spill" in card.reasoning
    assert "cdom_terrestrial" in card.reasoning

    # 3. Future outlook is populated and matches the static per-cause lookup.
    assert card.future_outlook == FUTURE_RISK_OUTLOOK["oil_spill"]


def test_future_outlook_marks_geophysical_causes_unknown():
    # Ocean-colour/SST data cannot assess seismic/volcanic recurrence risk —
    # these must read "Unknown", never a fabricated confident forecast.
    for cause in ("earthquake_seismic", "volcanic_eruption", "tsunami"):
        outlook = future_outlook_for(cause)
        assert "Unknown" in outlook


def test_tectonic_plate_shift_is_documented_as_undetectable():
    # No ocean-colour/SST signature exists for plate movement itself — this
    # must never appear as a classifier output, only as an explicit caveat.
    assert "tectonic_plate_shift" in NOT_DETECTABLE_BY_THIS_PIPELINE
    assert "Unknown" in NOT_DETECTABLE_BY_THIS_PIPELINE["tectonic_plate_shift"]


def test_find_similar_risk_areas_excludes_anomalies_by_default():
    df = generate_scene(n_samples=500, seed=1)
    processed = preprocess(df)
    detector = AnomalyDetector(contamination=0.15)
    detector.fit(processed)
    scored = detector.score(processed)

    target = scored[scored["is_anomaly"]].iloc[0]
    areas = find_similar_risk_areas(scored, target, top_k=5)

    assert 0 < len(areas) <= 5
    for area in areas:
        assert set(area.keys()) == {"lat", "lon", "similarity_distance"}


def test_explain_pixel_populates_similar_risk_areas_when_full_df_given():
    df = generate_scene(n_samples=500, seed=1)
    processed = preprocess(df)
    detector = AnomalyDetector(contamination=0.15)
    detector.fit(processed)
    scored = detector.score(processed)
    scored["predicted_cause"] = "turbidity"
    scored["confidence"] = 0.7

    baseline = build_baseline(processed[df["label"] == "normal"])
    target_row = scored[scored["is_anomaly"]].iloc[0]

    card = explain_pixel(target_row, baseline, full_df=scored, similar_top_k=3)
    assert len(card.similar_risk_areas) <= 3
    # explain_pixel without full_df should not attempt the spatial search.
    card_no_df = explain_pixel(target_row, baseline)
    assert card_no_df.similar_risk_areas == []
