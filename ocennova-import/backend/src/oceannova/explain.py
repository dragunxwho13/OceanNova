"""
Explainability — the "Why is this anomalous?" evidence card.

Every EvidenceCard answers several *deliberately separate* questions, so the
demo never blurs "what we measured" with "what we think it means" with
"what might happen next":

  1. observed_behavior — the raw measured pattern (which wavelengths moved,
     how much, plus the SST anomaly), in plain language. Pure data readout,
     no interpretation attached yet.

  2. reasoning — why that measured pattern points to the predicted cause
     rather than another one: confidence level, plus the runner-up cause the
     classifier considered and rejected. This is the "why did/does this
     happen" answer for an event that has already been observed.

  3. future_outlook — a static, cause-level recurrence narrative: under what
     generic conditions this *type* of event tends to happen again. This is
     NOT a forecast for this specific pixel — the pipeline has no time-series
     data to forecast from. For geophysical causes (earthquake, submarine
     volcanic activity, tsunami) this is explicitly "Unknown / requires
     external data", because ocean-colour reflectance and SST cannot assess
     seismic/tectonic recurrence risk at all, full stop.

  4. similar_risk_areas() — a separate, per-scene search for *other* pixels
     whose spectral+SST signature closely resembles the flagged pixel's but
     stayed below the anomaly threshold: early or borderline signals of the
     same pattern elsewhere, worth watching rather than dismissing.

Some events a reviewer might ask about (e.g. a tectonic plate shift itself,
as opposed to an earthquake it causes) have no ocean-colour or SST signature
at all. Those are listed in NOT_DETECTABLE_BY_THIS_PIPELINE and always
resolve to "Unknown" rather than being silently guessed at or dropped.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .synthetic_data import band_columns

# ---------------------------------------------------------------------------
# 1. Observed behavior — plain-language readout of *what the data shows*,
#    independent of any causal interpretation.
# ---------------------------------------------------------------------------


def _band_physical_context(wl: int) -> str:
    """Coarse physical meaning of a wavelength region, for plain-language output."""
    if wl < 400:
        return "UV range, CDOM/dissolved organic matter absorption"
    if wl < 460:
        return "blue band, chlorophyll-a absorption"
    if wl < 510:
        return "blue-green, typical clear-water reflectance peak"
    if wl < 570:
        return "green band, chlorophyll backscatter / turbidity"
    if wl < 620:
        return "yellow-orange, CDOM decay / sediment or oil hue"
    if wl < 670:
        return "red band, secondary chlorophyll absorption"
    if wl < 700:
        return "red-edge, chlorophyll fluorescence (dense-bloom indicator)"
    return "near-infrared, particulate/sediment backscatter or surface-film effects"


def _sst_context(delta: float) -> str:
    if delta is None or (isinstance(delta, float) and np.isnan(delta)):
        return "SST data unavailable"
    if delta >= 2.0:
        return f"a strong warm SST anomaly ({delta:+.1f}\u00b0C)"
    if delta >= 0.8:
        return f"a moderate warm SST anomaly ({delta:+.1f}\u00b0C)"
    if delta <= -2.0:
        return f"a strong cold SST anomaly ({delta:+.1f}\u00b0C)"
    if delta <= -0.8:
        return f"a moderate cold SST anomaly ({delta:+.1f}\u00b0C)"
    return f"an SST close to baseline ({delta:+.1f}\u00b0C)"


def _confidence_phrase(conf: float) -> str:
    if conf is None or (isinstance(conf, float) and np.isnan(conf)):
        return "confidence unavailable"
    if conf >= 0.85:
        return "high confidence"
    if conf >= 0.55:
        return "moderate confidence"
    return "low confidence \u2014 treat this label as provisional"


def describe_observed_behavior(
    top_deviating_bands: list[tuple[int, float]], sst_delta: float, n_bands: int = 2
) -> str:
    """Plain-language description of the measured pattern only — no cause attached yet."""
    band_phrases = [
        f"{wl}nm ({pct:+.0f}%, {_band_physical_context(wl)})" for wl, pct in top_deviating_bands[:n_bands]
    ]
    band_str = " and ".join(band_phrases) if band_phrases else "no significant spectral deviation"
    return f"Reflectance shifted most at {band_str}, alongside {_sst_context(sst_delta)}."


# ---------------------------------------------------------------------------
# 2. Causal reasoning — ties the observed behavior to *why* it points to the
#    predicted cause, including which alternative the model considered and
#    rejected. Answers "why did/does this happen" for an already-observed
#    pixel.
# ---------------------------------------------------------------------------


def build_reasoning(
    predicted_cause: str,
    confidence: float,
    cause_candidates: list[tuple[str, float]] | None,
) -> str:
    conf_phrase = _confidence_phrase(confidence)
    conf_pct = 0.0 if confidence is None or (isinstance(confidence, float) and np.isnan(confidence)) else confidence * 100
    text = f"The measured pattern matches '{predicted_cause}' with {conf_phrase} ({conf_pct:.0f}% probability)."
    if cause_candidates:
        runner_up = next((c for c in cause_candidates if c[0] != predicted_cause), None)
        if runner_up is not None:
            text += (
                f" The next-closest alternative considered was '{runner_up[0]}' "
                f"({runner_up[1] * 100:.0f}%), but the spectral shape and SST context "
                f"fit '{predicted_cause}' better."
            )
    return text


# ---------------------------------------------------------------------------
# 3. Future outlook — static, cause-level recurrence narrative. Deliberately
#    NOT a per-pixel forecast (no time-series data exists to forecast from)
#    — it's the generic conditions under which this *type* of event tends to
#    recur, for a human reviewer to check against. Geophysical causes are
#    marked Unknown by design: ocean-colour/SST data cannot assess
#    earthquake, volcanic, or tectonic recurrence risk at all.
# ---------------------------------------------------------------------------

FUTURE_RISK_OUTLOOK = {
    "normal": "No elevated recurrence risk indicated by current conditions.",
    "phytoplankton_bloom": (
        "Recurrence risk rises with sustained nutrient input (runoff, upwelling) and "
        "stable warm surface conditions. Watch regions with a persistent warm-SST "
        "anomaly near nutrient sources (river mouths, upwelling zones)."
    ),
    "red_tide": (
        "Recurrence risk rises with sustained warm SST, weak wind mixing, and nutrient "
        "loading \u2014 similar drivers to phytoplankton_bloom, biased toward calm, "
        "stratified coastal conditions historically linked to harmful algal blooms."
    ),
    "turbidity": (
        "Recurrence risk rises after storms, high wind/wave events, or tidal extremes "
        "that resuspend bottom sediment. Driven by local weather more than a slow "
        "trend \u2014 watch shallow/coastal regions following forecasted storm activity."
    ),
    "sediment_plume": (
        "Recurrence risk rises after heavy rainfall or river-discharge events upstream. "
        "Watch river-mouth and estuarine regions following precipitation spikes."
    ),
    "sediment_intrusion": (
        "Recurrence risk rises with storm-driven benthic resuspension or an unusual "
        "current bringing a different water mass to the surface."
    ),
    "cdom_terrestrial": (
        "Recurrence risk tracks river discharge and seasonal runoff cycles \u2014 higher "
        "during/after wet-season rainfall in regions near river outflows."
    ),
    "oil_spill": (
        "Recurrence risk is tied to shipping-traffic density, proximity to offshore "
        "infrastructure, and reported incidents \u2014 not an environmental cycle. "
        "Cross-check AIS shipping data or incident reports rather than treating this "
        "as a recurring seasonal pattern."
    ),
    "volcanic_eruption": (
        "Unknown \u2014 requires external data. Ocean-colour and SST alone cannot assess "
        "submarine volcanic recurrence risk. Requires seismic/volcanological monitoring "
        "(e.g. USGS, Smithsonian Global Volcanism Program) for the specific seamount/vent."
    ),
    "earthquake_seismic": (
        "Unknown \u2014 requires external data. Ocean-colour and SST alone cannot assess "
        "seismic recurrence risk. Requires seismic network data (e.g. USGS) tied to the "
        "region's fault/plate structure."
    ),
    "tsunami": (
        "Unknown \u2014 requires external data. Tsunami risk is a function of regional "
        "seismic/tectonic hazard, not ocean colour. Cross-check tide-gauge and DART buoy "
        "networks plus regional seismic hazard maps."
    ),
    "heatwave_ecosystem": (
        "Recurrence risk rises with a persistent positive SST anomaly and reduced "
        "vertical mixing (stratification). Watch regions already showing a warming SST "
        "trend for the current season."
    ),
    "unusual_current_disturbance": (
        "Recurrence risk tracks regional current/eddy climatology \u2014 some regions are "
        "persistently eddy-active. Watch known eddy-formation zones (western boundary "
        "currents, current-confluence zones) rather than treating this as random."
    ),
    "unusual_community": "Unknown \u2014 signature doesn't match a known pattern closely enough to assess future risk.",
    "unknown_mixed": "Unknown \u2014 low classifier confidence leaves insufficient basis to assess future risk.",
}

# Events a reviewer might ask about that this pipeline cannot detect or
# assess at all from any combination of ocean-colour reflectance + SST. Not
# part of the classifier's output space (no fabricated signature exists for
# them) — listed here purely so the UI can say "Unknown" honestly instead of
# silently ignoring the question.
NOT_DETECTABLE_BY_THIS_PIPELINE = {
    "tectonic_plate_shift": (
        "Unknown \u2014 no ocean-colour or SST signature exists for tectonic plate "
        "movement itself. Only a resulting earthquake, submarine eruption, or tsunami "
        "might leave a secondary optical/thermal proxy (see those causes) \u2014 the "
        "plate shift itself requires geological/seismic monitoring data this pipeline "
        "does not have."
    ),
}


def future_outlook_for(cause: str) -> str:
    return FUTURE_RISK_OUTLOOK.get(cause, "Unknown \u2014 no risk model defined for this cause.")


# ---------------------------------------------------------------------------
# 4. Similar-risk areas — other pixels in the same scene whose spectral+SST
#    signature is closest to the flagged pixel's but which stayed below the
#    anomaly threshold: early/borderline signals of the same pattern,
#    answering "where else could this happen" rather than "where did it".
# ---------------------------------------------------------------------------


def find_similar_risk_areas(
    df: pd.DataFrame,
    target_row: pd.Series,
    top_k: int = 5,
    exclude_anomalies: bool = True,
) -> list[dict]:
    """
    Nearest-neighbour search in (band + SST) feature space, restricted by
    default to pixels NOT already flagged as anomalies, to surface areas
    showing an early/partial version of the target pixel's signature.
    """
    bands = band_columns(df)
    feature_cols = bands + (["sst_c"] if "sst_c" in df.columns else [])

    candidates = df
    if exclude_anomalies and "is_anomaly" in df.columns:
        candidates = df[~df["is_anomaly"]]
    if candidates.empty:
        return []

    target_vec = target_row[feature_cols].to_numpy(dtype=float)
    cand_vecs = candidates[feature_cols].to_numpy(dtype=float)

    # Scale-normalize by per-feature std so bands and SST (very different
    # units/scales) contribute comparably to the distance.
    std = cand_vecs.std(axis=0)
    std[std == 0] = 1.0
    dist = np.sqrt((((cand_vecs - target_vec) / std) ** 2).sum(axis=1))

    k = min(top_k, len(candidates))
    order = np.argsort(dist)[:k]

    out = []
    for i in order:
        r = candidates.iloc[i]
        out.append(
            {
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "similarity_distance": float(dist[i]),
            }
        )
    return out


# ---------------------------------------------------------------------------
# EvidenceCard — bundles all of the above for one flagged pixel.
# ---------------------------------------------------------------------------


@dataclass
class EvidenceCard:
    lat: float
    lon: float
    anomaly_score: float
    predicted_cause: str
    confidence: float
    sst_c: float
    baseline_sst_c: float
    top_deviating_bands: list[tuple[int, float]] = field(default_factory=list)
    cause_candidates: list[tuple[str, float]] = field(default_factory=list)
    observed_behavior: str = ""
    reasoning: str = ""
    future_outlook: str = ""
    similar_risk_areas: list[dict] = field(default_factory=list)

    def summary(self) -> str:
        band_str = ", ".join(f"{wl}nm ({pct:+.0f}%)" for wl, pct in self.top_deviating_bands[:3])
        sst_delta = self.sst_c - self.baseline_sst_c
        return (
            f"Anomaly {self.anomaly_score:.0f}/100 at ({self.lat:.2f}, {self.lon:.2f}). "
            f"Main spectral deviation: {band_str}. "
            f"SST {sst_delta:+.1f}C vs baseline. "
            f"Likely cause: {self.predicted_cause} (confidence {self.confidence * 100:.0f}%)."
        )


def build_baseline(normal_df: pd.DataFrame) -> pd.Series:
    """Mean spectrum + mean SST across pixels labeled/predicted 'normal'."""
    bands = band_columns(normal_df)
    baseline = normal_df[bands].mean()
    if "sst_c" in normal_df.columns:
        baseline["sst_c"] = normal_df["sst_c"].mean()
    return baseline


def explain_pixel(
    row: pd.Series,
    baseline: pd.Series,
    top_n: int = 5,
    full_df: pd.DataFrame | None = None,
    similar_top_k: int = 5,
) -> EvidenceCard:
    """
    Build the full evidence card for one flagged pixel.

    full_df is optional: pass the scene's scored DataFrame to additionally
    populate similar_risk_areas (other pixels worth watching). Without it,
    the card still includes observed_behavior / reasoning / future_outlook,
    just not the spatial "where else" search.
    """
    bands = [c for c in baseline.index if c.startswith("band_")]
    # Floor for the baseline denominator: avoids pct-change blowing up to
    # thousands of percent in near-zero NIR/UV tail bands, which is a
    # display artifact rather than a meaningful spectral signal.
    floor = max(baseline[bands].max() * 0.05, 1e-6)

    deviations = []
    for b in bands:
        base_val = max(baseline[b], floor)
        cur_val = row[b]
        pct_change = 100 * (cur_val - base_val) / base_val
        wl = int(b.split("_")[1])
        deviations.append((wl, pct_change))

    deviations.sort(key=lambda x: abs(x[1]), reverse=True)
    top_bands = deviations[:top_n]

    sst_c = row.get("sst_c", np.nan)
    baseline_sst_c = baseline.get("sst_c", np.nan)
    sst_delta = (
        sst_c - baseline_sst_c if not (np.isnan(sst_c) or np.isnan(baseline_sst_c)) else float("nan")
    )

    predicted_cause = row.get("predicted_cause", "n/a")
    confidence = row.get("confidence", np.nan)

    cause_candidates = row.get("cause_candidates", None)
    if not isinstance(cause_candidates, list):
        cause_candidates = []

    observed_behavior = describe_observed_behavior(top_bands, sst_delta)
    reasoning = build_reasoning(predicted_cause, confidence, cause_candidates)
    outlook = future_outlook_for(predicted_cause)

    similar_areas: list[dict] = []
    if full_df is not None:
        similar_areas = find_similar_risk_areas(full_df, row, top_k=similar_top_k)

    return EvidenceCard(
        lat=row["lat"],
        lon=row["lon"],
        anomaly_score=row.get("anomaly_score", np.nan),
        predicted_cause=predicted_cause,
        confidence=confidence,
        sst_c=sst_c,
        baseline_sst_c=baseline_sst_c,
        top_deviating_bands=top_bands,
        cause_candidates=cause_candidates,
        observed_behavior=observed_behavior,
        reasoning=reasoning,
        future_outlook=outlook,
        similar_risk_areas=similar_areas,
    )
