"""
Synthetic hyperspectral ocean-colour data generator.

PACE OCI produces remote-sensing reflectance (Rrs) across ~200 bands from
~340-890 nm (plus SWIR). Real L2 data comes as NetCDF from NASA Earthdata
(OB.DAAC, product PACE_OCI_L2_AOP / PACE_OCI_L2_BGC).

This module is a stand-in so the pipeline is runnable end-to-end offline,
for development and demo purposes, before wiring in real PACE granules.
Swap `generate_scene()` for a real loader (see src/oceannova/io_pace.py)
once you have downloaded data.

CAUSE TAXONOMY — IMPORTANT SCIENTIFIC CAVEAT
---------------------------------------------
Ocean-colour hyperspectral sensors observe *surface/near-surface optical
reflectance only*. Some classes below (phytoplankton blooms, red tide,
turbidity/sediment, CDOM, oil slicks) are things ocean colour can plausibly
detect fairly directly, since they change the water's optical properties.

Other classes (volcanic activity, earthquakes, tsunamis, unusual current
disturbances) are geophysical/dynamical *events* — ocean colour cannot see
them directly. What it *can* see is a secondary optical signature they can
leave behind (a sediment plume, an SST spike, an unusual turbidity pattern).
Those classes are included because they are useful hypotheses for a human
reviewer to check against independent evidence (seismic networks, tide
gauges, thermal/SST imagery) — not because the pipeline is claiming direct
detection. Each such explanation below says so explicitly, and the
Streamlit demo surfaces that caveat in the evidence card.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Approximate PACE OCI visible/NIR band centers (nm), coarsened for demo speed.
WAVELENGTHS = np.arange(350, 720, 5)

# Classes ocean-colour reflectance can plausibly detect fairly directly.
DIRECT_OPTICAL_CLASSES = [
    "normal",
    "phytoplankton_bloom",
    "red_tide",
    "turbidity",
    "sediment_plume",
    "sediment_intrusion",
    "cdom_terrestrial",
    "oil_spill",
]

# Classes representing geophysical/dynamical events. Ocean colour only ever
# sees an indirect optical proxy for these (see module docstring) — never
# treat a prediction in this group as a direct detection of the event.
PROXY_EVENT_CLASSES = [
    "volcanic_eruption",
    "earthquake_seismic",
    "tsunami",
    "heatwave_ecosystem",
    "unusual_current_disturbance",
]

# Held out of training entirely so it can be used to validate that the
# unknown/OOD pathway actually catches signatures the classifier never saw.
HELDOUT_UNKNOWN_CLASS = "unusual_community"

CLASSES = DIRECT_OPTICAL_CLASSES + PROXY_EVENT_CLASSES + [HELDOUT_UNKNOWN_CLASS]

# Human-readable physical explanation for each class — this is what should
# actually answer "why is this anomalous", not just the bare class name.
# Entries for PROXY_EVENT_CLASSES explicitly flag the indirect/proxy nature.
CAUSE_EXPLANATIONS = {
    "normal": "Spectral signature consistent with typical open-ocean water.",
    "phytoplankton_bloom": (
        "Elevated chlorophyll-a signature: absorption dip near 443nm plus "
        "reflectance rise near 550-570nm, consistent with a general "
        "phytoplankton bloom (not necessarily harmful)."
    ),
    "red_tide": (
        "Strong chlorophyll absorption near 443nm plus a distinct reflectance "
        "peak near 680-685nm (chlorophyll fluorescence), sharper and larger in "
        "magnitude than a generic bloom — consistent with a dense bloom / "
        "harmful algal bloom (HAB) such as a red tide. Confirm against local "
        "HAB monitoring bulletins before treating as toxic."
    ),
    "turbidity": (
        "Broad, fairly uniform reflectance increase across visible wavelengths "
        "into the NIR, consistent with generalized suspended-sediment "
        "turbidity (e.g. wind/wave resuspension, tidal mixing)."
    ),
    "sediment_plume": (
        "Strong, spectrally-peaked reflectance increase (mid-visible) paired "
        "with a surface cooling signal, consistent with a river-discharge or "
        "coastal freshwater sediment plume."
    ),
    "sediment_intrusion": (
        "Flat, low-slope broadband reflectance increase across the full "
        "spectrum with a near-neutral SST signal, consistent with an "
        "intrusion of a different, sediment-bearing water mass (e.g. "
        "storm-driven benthic resuspension) rather than a river plume."
    ),
    "cdom_terrestrial": (
        "Strong absorption in UV/blue wavelengths decaying toward green, "
        "consistent with coloured dissolved organic matter (CDOM) - typically "
        "terrestrial/riverine runoff influence."
    ),
    "oil_spill": (
        "Broad suppression of water-leaving reflectance across the visible "
        "spectrum (oil film dampens the signal) with a narrow sheen-like "
        "reflectance bump in the NIR, consistent with a surface oil slick. "
        "Verify with SAR imagery or a reported incident before acting on this."
    ),
    "volcanic_eruption": (
        "PROXY SIGNATURE, NOT A DIRECT DETECTION. Flat, grey, broadband "
        "reflectance increase (ash/particulate scattering) combined with a "
        "large localized SST spike (vent/plume heating). Ocean colour cannot "
        "see an eruption itself — this pattern only flags a plausible "
        "ash-plume/thermal proxy. Cross-check against seismic and thermal "
        "(e.g. VIIRS hotspot) data before drawing conclusions."
    ),
    "earthquake_seismic": (
        "PROXY SIGNATURE, NOT A DIRECT DETECTION. Sudden, large-magnitude "
        "broadband turbidity increase consistent with an underwater landslide "
        "or seismically-triggered turbidity current reaching the surface "
        "layer. Ocean colour cannot detect the earthquake itself — cross-check "
        "against seismic network catalogs (e.g. USGS) for a matching event."
    ),
    "tsunami": (
        "PROXY SIGNATURE, HIGHLY SPECULATIVE. Extreme, sudden broadband "
        "turbidity spike paired with a rapid SST drop (subsurface water mixed "
        "to the surface). Ocean-colour satellites are NOT a tsunami detection "
        "tool and revisit times are usually far too slow to catch the event "
        "itself — treat this only as a nearshore-disturbance hypothesis to "
        "check against tide gauges / DART buoy networks."
    ),
    "heatwave_ecosystem": (
        "Large positive SST anomaly is the dominant evidence here, "
        "accompanied by a secondary, comparatively subtle spectral shift "
        "consistent with a change in the dominant phytoplankton community "
        "(marine heatwave-driven ecosystem shift) rather than a discrete "
        "bloom event."
    ),
    "unusual_current_disturbance": (
        "PROXY SIGNATURE. A smooth, low-amplitude spectral blend that does "
        "not cleanly match any single known optical class, paired with an "
        "SST shift of variable sign — consistent with mixing at an eddy or "
        "current boundary (warm-core or cold-core). This is an ambiguous "
        "signature by nature; treat as a lead for a human reviewer rather "
        "than a confirmed detection."
    ),
    "unusual_community": (
        "Irregular spectral deviation that does not match any known cause "
        "pattern in this model. Flagged as unknown/mixed for scientific review "
        "rather than forced into a known category."
    ),
    "unknown_mixed": (
        "Classifier confidence was too low to confidently assign a known "
        "cause. This may be an atypical or under-represented phenomenon, "
        "sensor artifact, or a combination of causes - flagged for review."
    ),
}

# A handful of real ocean regions (open water, away from major landmasses) so
# a demo scene isn't hardcoded to one country. Each is (name, lat_min, lat_max,
# lon_min, lon_max). Boxes are hand-picked to sit over open water for these
# specific regions, but this is a coarse heuristic (a plain rectangle), not a
# true coastline/landmask - for production use, mask against a real
# land/ocean shapefile (e.g. Natural Earth via geopandas) instead.
OCEAN_REGIONS = {
    "arabian_sea": ("Arabian Sea (open water)", 13.0, 18.0, 66.0, 69.0),
    "bay_of_bengal": ("Bay of Bengal (open water)", 11.0, 16.0, 86.0, 90.0),
    "gulf_of_mexico": ("Gulf of Mexico (open water)", 23.0, 26.0, -91.0, -87.0),
    "north_sea": ("North Sea (open water)", 55.0, 57.5, 3.0, 6.0),
    "coral_sea": ("Coral Sea, off NE Australia (open water)", -17.0, -13.0, 150.0, 154.0),
    "california_current": ("Pacific, off US West Coast (open water)", 31.0, 36.0, -126.0, -123.5),
    "south_china_sea": ("South China Sea (open water)", 9.0, 13.0, 113.0, 117.0),
    "mediterranean": ("Mediterranean Sea, central (open water)", 35.0, 37.5, 12.0, 18.0),
    "global_mixed": ("Global (mixed open-ocean regions)", None, None, None, None),
}

# Deterministic per-class SST offset (°C) applied on top of ambient SST, for
# cross-feature realism (the classifier uses SST alongside spectral shape).
# "unusual_current_disturbance" is handled separately below since a real
# eddy can be either warm-core or cold-core — sign is randomized per pixel.
CLASS_SST_OFFSET = {
    "normal": 0.0,
    "phytoplankton_bloom": 1.4,
    "red_tide": 1.8,
    "turbidity": 0.0,
    "sediment_plume": -1.0,
    "sediment_intrusion": 0.3,
    "cdom_terrestrial": 0.0,
    "oil_spill": 0.2,
    "volcanic_eruption": 3.0,
    "earthquake_seismic": 0.0,
    "tsunami": -2.0,
    "heatwave_ecosystem": 3.5,
    "unusual_community": 0.0,
}


def _baseline_spectrum(wavelengths: np.ndarray) -> np.ndarray:
    """Typical open-ocean clear-water Rrs shape: peak in blue-green, low in NIR."""
    peak = 480
    width = 60
    base = 0.004 * np.exp(-((wavelengths - peak) ** 2) / (2 * width ** 2))
    base += 0.0006  # small NIR baseline
    return base


def _class_perturbation(cls: str, wavelengths: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Apply a class-specific spectral shift on top of the baseline."""
    n = len(wavelengths)
    wl = wavelengths

    if cls == "normal":
        return np.zeros(n)

    if cls == "phytoplankton_bloom":
        # Chlorophyll absorption dip ~443nm, reflectance rise ~550-570nm (chl-a signature)
        dip = -0.0015 * np.exp(-((wl - 443) ** 2) / (2 * 15 ** 2))
        rise = 0.0025 * np.exp(-((wl - 560) ** 2) / (2 * 25 ** 2))
        return dip + rise

    if cls == "red_tide":
        # Sharper/stronger chlorophyll dip + a fluorescence-like bump near 683nm,
        # distinguishing a dense/HAB-like bloom from a generic bloom.
        dip = -0.0025 * np.exp(-((wl - 443) ** 2) / (2 * 12 ** 2))
        rise = 0.0015 * np.exp(-((wl - 560) ** 2) / (2 * 20 ** 2))
        fluor = 0.0018 * np.exp(-((wl - 683) ** 2) / (2 * 8 ** 2))
        return dip + rise + fluor

    if cls == "turbidity":
        # Broad, fairly monotonic reflectance increase across visible + into NIR
        return 0.0018 * (1 - np.exp(-(wl - 350) / 300)) * (wl < 700)

    if cls == "sediment_plume":
        # Peaked (not monotonic) mid-visible increase - a plume front, not a
        # generalized haze - paired with plume-driven surface cooling (see
        # CLASS_SST_OFFSET).
        return 0.0028 * np.exp(-((wl - 580) ** 2) / (2 * 90 ** 2))

    if cls == "sediment_intrusion":
        # Flat, low-slope broadband increase (greyer/less wavelength-selective
        # than a plume or generic turbidity signature).
        return 0.0012 + 0.000002 * (wl - 350)

    if cls == "cdom_terrestrial":
        # Strong absorption in UV/blue, decaying toward green (CDOM signature)
        return -0.0022 * np.exp(-(wl - 350) / 90)

    if cls == "oil_spill":
        # Broad suppression (oil film dampens water-leaving reflectance) plus
        # a narrow NIR sheen bump.
        suppression = -0.0016 * np.exp(-((wl - 500) ** 2) / (2 * 140 ** 2))
        sheen = 0.0008 * np.exp(-((wl - 710) ** 2) / (2 * 15 ** 2))
        return suppression + sheen

    if cls == "volcanic_eruption":
        # Flat, strong, grey broadband increase (ash/particulate scattering)
        # plus mild blue-band absorption (ash/sulfur-compound tint).
        ash = 0.0022 * np.ones(n)
        blue_absorb = -0.0009 * np.exp(-((wl - 410) ** 2) / (2 * 40 ** 2))
        return ash + blue_absorb

    if cls == "earthquake_seismic":
        # Sudden, large-magnitude broadband turbidity increase (underwater
        # landslide / seismically-triggered turbidity current).
        return 0.0026 * (1 - np.exp(-(wl - 350) / 250)) * (wl < 700)

    if cls == "tsunami":
        # Extreme broadband turbidity spike, larger than any other sediment-like
        # class, paired with a sharp SST drop (see CLASS_SST_OFFSET).
        return 0.0032 * (1 - np.exp(-(wl - 350) / 200)) * (wl < 710)

    if cls == "heatwave_ecosystem":
        # Subtle community-shift signature (secondary evidence) - the SST
        # anomaly (CLASS_SST_OFFSET) is the dominant signal for this class.
        dip = -0.0008 * np.exp(-((wl - 480) ** 2) / (2 * 30 ** 2))
        rise = 0.0010 * np.exp(-((wl - 520) ** 2) / (2 * 20 ** 2))
        return dip + rise

    if cls == "unusual_current_disturbance":
        # Smooth, low-amplitude undulation - deliberately doesn't match any
        # other class's fingerprint cleanly (mixing at a water-mass boundary).
        return 0.0010 * np.sin((wl - 350) / 60.0)

    if cls == "unusual_community":
        # Irregular, less-structured deviation (mixed/atypical assemblage)
        shift = rng.normal(0, 0.0009, size=n)
        smooth = np.convolve(shift, np.ones(5) / 5, mode="same")
        return smooth

    raise ValueError(f"Unknown class: {cls}")


def generate_scene(
    n_samples: int = 2000,
    anomaly_fraction: float = 0.30,
    unknown_fraction: float = 0.03,
    seed: int = 42,
    region: str = "global_mixed",
) -> pd.DataFrame:
    """
    Generate a synthetic scene of per-pixel hyperspectral Rrs spectra with
    lat/lon, SST, and ground-truth labels for development and demo purposes.

    region: key into OCEAN_REGIONS. "global_mixed" (default) scatters pixels
    across several real open-ocean regions worldwide rather than hardcoding
    a single country/sea, so the demo isn't biased toward one location.

    anomaly_fraction default is intentionally higher than a real scene's
    prevalence (real anomalies are rare) so that, spread across a wider
    taxonomy of known-cause classes, each class still gets enough synthetic
    samples for a meaningful train/test split.

    Returns a DataFrame with columns:
        lat, lon, sst_c, label, cause_reason, band_<wavelength>...
    """
    rng = np.random.default_rng(seed)
    wavelengths = WAVELENGTHS
    baseline = _baseline_spectrum(wavelengths)

    n_anomaly = int(n_samples * anomaly_fraction)
    n_unknown = int(n_samples * unknown_fraction)
    n_normal = n_samples - n_anomaly - n_unknown

    known_anomaly_classes = DIRECT_OPTICAL_CLASSES[1:] + PROXY_EVENT_CLASSES  # excludes "normal"

    labels = (
        ["normal"] * n_normal
        + list(rng.choice(known_anomaly_classes, size=n_anomaly))
        + [HELDOUT_UNKNOWN_CLASS] * n_unknown
    )
    rng.shuffle(labels)

    if region == "global_mixed":
        # Distribute pixels across all named open-ocean regions (excluding
        # the "global_mixed" pseudo-entry itself).
        region_keys = [k for k in OCEAN_REGIONS if k != "global_mixed"]
        assigned_regions = rng.choice(region_keys, size=n_samples)
        lat = np.empty(n_samples)
        lon = np.empty(n_samples)
        for i, rkey in enumerate(assigned_regions):
            _, lat_min, lat_max, lon_min, lon_max = OCEAN_REGIONS[rkey]
            lat[i] = rng.uniform(lat_min, lat_max)
            lon[i] = rng.uniform(lon_min, lon_max)
    else:
        if region not in OCEAN_REGIONS:
            raise ValueError(f"Unknown region '{region}'. Choose from: {list(OCEAN_REGIONS)}")
        _, lat_min, lat_max, lon_min, lon_max = OCEAN_REGIONS[region]
        lat = rng.uniform(lat_min, lat_max, size=n_samples)
        lon = rng.uniform(lon_min, lon_max, size=n_samples)

    sst = rng.normal(28.0, 1.5, size=n_samples)

    rows = []
    for i, cls in enumerate(labels):
        perturb = _class_perturbation(cls, wavelengths, rng)
        noise = rng.normal(0, 0.00015, size=len(wavelengths))
        spectrum = np.clip(baseline + perturb + noise, 0, None)

        if cls == "unusual_current_disturbance":
            # Eddies can be warm-core or cold-core - randomize the sign per pixel
            # rather than hardcoding a single direction.
            sst_i = sst[i] + rng.choice([-1.0, 1.0]) * rng.uniform(1.0, 2.0)
        else:
            sst_i = sst[i] + CLASS_SST_OFFSET.get(cls, 0.0)

        row = {
            "lat": lat[i],
            "lon": lon[i],
            "sst_c": sst_i,
            "label": cls,
            "cause_reason": CAUSE_EXPLANATIONS[cls],
        }
        row.update({f"band_{wl}": val for wl, val in zip(wavelengths, spectrum)})
        rows.append(row)

    return pd.DataFrame(rows)


def band_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c.startswith("band_")]


if __name__ == "__main__":
    scene = generate_scene()
    out_path = "data/processed/synthetic_scene.csv"
    scene.to_csv(out_path, index=False)
    print(f"Wrote {len(scene)} synthetic pixels to {out_path}")
    print(scene["label"].value_counts())
