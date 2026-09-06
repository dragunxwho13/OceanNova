"""
OCEANNOVA Streamlit demo.

Run with:  streamlit run app/streamlit_app.py

Interactive anomaly map -> click/select a point -> spectrum comparison
+ evidence card, matching the hackathon plan's frontend requirements
(Section 12, MVP: Map + Evidence card).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from oceannova.anomaly import AnomalyDetector  # noqa: E402
from oceannova.classifier import CauseClassifier  # noqa: E402
from oceannova.explain import NOT_DETECTABLE_BY_THIS_PIPELINE, build_baseline, explain_pixel  # noqa: E402
from oceannova.preprocessing import add_derivative_features, normalize_spectra, quality_control  # noqa: E402
from oceannova.synthetic_data import (  # noqa: E402
    CAUSE_EXPLANATIONS,
    OCEAN_REGIONS,
    PROXY_EVENT_CLASSES,
    band_columns,
    generate_scene,
)

st.set_page_config(page_title="OCEANNOVA", layout="wide")

st.title("OCEANNOVA")
st.caption("AI-Powered Hyperspectral Ocean Anomaly Intelligence — DETECT -> EXPLAIN -> CLASSIFY -> FLAG THE UNKNOWN")

st.sidebar.header("Scene controls")
region_options = list(OCEAN_REGIONS.keys())
region_labels = {k: v[0] for k, v in OCEAN_REGIONS.items()}
region = st.sidebar.selectbox(
    "Region",
    region_options,
    index=region_options.index("global_mixed"),
    format_func=lambda k: region_labels[k],
)
n_samples = st.sidebar.slider("Number of pixels", 1500, 8000, 3000, step=500)
seed = st.sidebar.number_input("Random seed", value=42, step=1)
run_button = st.sidebar.button("Generate & analyze scene", type="primary")

st.sidebar.markdown("---")
st.sidebar.caption(
    "Demo uses synthetic hyperspectral data shaped like PACE OCI Rrs spectra. "
    "Points are sampled over open-ocean regions worldwide (or a single region "
    "if selected above) — this is placeholder data, not real satellite "
    "observations. Swap in real PACE granules via `src/oceannova/io_pace.py` "
    "once downloaded."
)

with st.sidebar.expander("Events this system cannot detect"):
    st.caption(
        "Ocean-colour reflectance + SST only see the sea surface. Some events "
        "a reviewer might look for have no signature here at all:"
    )
    for cause, note in NOT_DETECTABLE_BY_THIS_PIPELINE.items():
        st.markdown(f"**{cause.replace('_', ' ').title()}**")
        st.caption(note)


@st.cache_data(show_spinner=False)
def compute_scene(n_samples: int, seed: int, region: str):
    raw = generate_scene(n_samples=n_samples, seed=seed, region=region)
    raw_clean = quality_control(raw)  # raw units, QC'd — classifier trains/predicts on this

    # Anomaly detection runs on L2-normalized spectral *shape*; the classifier
    # runs on raw (QC'd) reflectance + SST. These are deliberately different
    # feature spaces (see pipeline.py docstring) — mixing them at predict time
    # silently breaks the classifier's decision boundaries and collapses
    # every prediction onto one class, so each model is fit AND predicted on
    # its own space here, both derived from raw_clean in the same row order.
    processed = add_derivative_features(normalize_spectra(raw_clean))

    detector = AnomalyDetector()
    detector.fit(processed)
    scored = detector.score(processed)

    classifier = CauseClassifier()
    classifier.fit(raw_clean)
    class_pred = classifier.predict(raw_clean)

    predicted = scored.copy()
    predicted["predicted_cause"] = class_pred["predicted_cause"].to_numpy()
    predicted["confidence"] = class_pred["confidence"].to_numpy()
    predicted["cause_candidates"] = class_pred["cause_candidates"].to_numpy()
    # Attach a human-readable reason for the *predicted* cause (which may be
    # "unknown_mixed" and differ from the synthetic ground-truth label).
    predicted["cause_reason"] = predicted["predicted_cause"].map(CAUSE_EXPLANATIONS)

    baseline = build_baseline(processed[raw_clean["label"] == "normal"])
    return raw_clean, predicted, baseline


cache_key = (n_samples, seed, region)
if run_button or "scene_data" not in st.session_state or st.session_state.get("cache_key") != cache_key:
    with st.spinner("Running anomaly detection + classification pipeline..."):
        raw, scored, baseline = compute_scene(n_samples, seed, region)
        st.session_state["scene_data"] = (raw, scored, baseline)
        st.session_state["cache_key"] = cache_key

raw, scored, baseline = st.session_state["scene_data"]

col_map, col_detail = st.columns([3, 2])

with col_map:
    st.subheader("Anomaly map")
    st.caption(
        "Marker size and colour both reflect anomaly score (0-100). "
        "Hover a point for its predicted cause and confidence."
    )
    # Plotly renamed scatter_mapbox -> scatter_map in newer versions (5.24+).
    # Support both so this works regardless of installed plotly version.
    # size_max caps marker pixel size — without it, Plotly's automatic size
    # scaling on a 0-100 field can render oversized/overlapping markers and
    # make hover values hard to read correctly.
    map_kwargs = dict(
        lat="lat",
        lon="lon",
        color="anomaly_score",
        size="anomaly_score",
        size_max=18,
        hover_name="predicted_cause",
        hover_data={
            "lat": ":.2f",
            "lon": ":.2f",
            "anomaly_score": ":.1f",
            "confidence": ":.2f",
            "sst_c": ":.1f",
        },
        color_continuous_scale="Turbo",
        range_color=(0, 100),
        zoom=2 if region == "global_mixed" else 5,
        height=550,
    )
    if hasattr(px, "scatter_map"):
        fig = px.scatter_map(scored, map_style="carto-positron", **map_kwargs)
    else:
        fig = px.scatter_mapbox(scored, mapbox_style="carto-positron", **map_kwargs)
    fig.update_layout(margin=dict(l=0, r=0, t=0, b=0))
    st.plotly_chart(fig, use_container_width=True)

    st.markdown("**Top anomalies**")
    top = scored[scored["is_anomaly"]].sort_values("anomaly_score", ascending=False).head(10)
    st.dataframe(
        top[["lat", "lon", "anomaly_score", "predicted_cause", "confidence", "sst_c"]].reset_index(drop=True),
        use_container_width=True,
    )

with col_detail:
    st.subheader("Evidence card")
    if len(top) == 0:
        st.info("No anomalies flagged in this scene.")
    else:
        options = [f"#{i} — score {row.anomaly_score:.0f} — {row.predicted_cause}" for i, row in top.reset_index().iterrows()]
        selected = st.selectbox("Select anomaly", options)
        idx = int(selected.split("—")[0].strip("# "))
        row = top.reset_index(drop=True).iloc[idx]

        # full_df=scored lets the card also surface similar_risk_areas — other
        # pixels in this scene with a close-but-below-threshold match.
        card = explain_pixel(row, baseline, full_df=scored, similar_top_k=5)

        st.markdown(f"**Location:** {card.lat:.2f}, {card.lon:.2f}")
        st.metric("Anomaly score", f"{card.anomaly_score:.0f}/100")
        st.metric("Predicted cause", card.predicted_cause)
        st.metric("Confidence", f"{card.confidence * 100:.0f}%")
        st.metric("SST vs baseline", f"{card.sst_c - card.baseline_sst_c:+.1f} C")

        st.markdown("**What is this cause?**")
        st.info(row.get("cause_reason", CAUSE_EXPLANATIONS.get(card.predicted_cause, "No explanation available.")))

        st.markdown("**Observed behavior** — what the data actually shows")
        st.write(card.observed_behavior)

        st.markdown("**Why this label?** — reasoning behind the call")
        st.write(card.reasoning)

        if card.cause_candidates:
            st.markdown("**Confidence breakdown** — causes considered")
            cand_df = pd.DataFrame(card.cause_candidates, columns=["cause", "probability"]).set_index("cause")
            st.bar_chart(cand_df)

        st.markdown("**Future outlook** — when this type of event tends to recur")
        st.write(card.future_outlook)

        st.markdown("**Top deviating wavelengths**")
        for wl, pct in card.top_deviating_bands:
            st.write(f"- {wl} nm ({pct:+.0f}% vs baseline)")

        st.markdown("**Spectrum comparison**")
        bands = band_columns(raw)
        wavelengths = [int(b.split("_")[1]) for b in bands]

        spec_fig = go.Figure()
        spec_fig.add_trace(go.Scatter(x=wavelengths, y=baseline[bands], name="Baseline (normal)", line=dict(color="gray", dash="dash")))
        spec_fig.add_trace(go.Scatter(x=wavelengths, y=row[bands], name="This pixel", line=dict(color="crimson")))
        spec_fig.update_layout(
            xaxis_title="Wavelength (nm)",
            yaxis_title="Rrs (normalized)",
            height=350,
            margin=dict(l=0, r=0, t=20, b=0),
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
        )
        st.plotly_chart(spec_fig, use_container_width=True)

        if card.similar_risk_areas:
            st.markdown("**Other areas to watch** — similar signature, still below threshold")
            st.caption(
                "Other pixels in this scene whose spectral + SST pattern most closely "
                "resembles this one but hasn't crossed the anomaly threshold — early or "
                "borderline signals of the same pattern worth checking, not a forecast."
            )
            watch_df = pd.DataFrame(card.similar_risk_areas)
            st.dataframe(watch_df, use_container_width=True, hide_index=True)

        if card.predicted_cause == "unknown_mixed":
            st.warning(
                "This signature does not confidently match a known class. "
                "Flagged for scientific review rather than forced classification."
            )
        elif card.predicted_cause in PROXY_EVENT_CLASSES:
            st.warning(
                "This is a PROXY signature, not a direct detection. Ocean-colour "
                "reflectance can only see a secondary optical/thermal effect "
                "possibly linked to this cause — cross-check with independent "
                "data (seismic networks, tide gauges, thermal imagery) before "
                "drawing conclusions."
            )
