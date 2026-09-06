"""
Preprocessing: spectral normalization and basic quality control.

For real PACE L2 data, QC should also drop pixels flagged for cloud
contamination, land, sun-glint, or high atmospheric-correction failure
(check the L2 flags/qc variables in the NetCDF file). That step is stubbed
in io_pace.py — apply it before this module.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .synthetic_data import band_columns


def quality_control(df: pd.DataFrame, max_reflectance: float = 0.05) -> pd.DataFrame:
    """Drop rows with invalid (negative or implausibly high) reflectance values."""
    bands = band_columns(df)
    valid = (df[bands] >= 0).all(axis=1) & (df[bands] <= max_reflectance).all(axis=1)
    dropped = (~valid).sum()
    if dropped:
        print(f"[QC] Dropping {dropped} pixels failing quality control")
    return df.loc[valid].reset_index(drop=True)


def normalize_spectra(df: pd.DataFrame) -> pd.DataFrame:
    """
    L2-normalize each pixel's spectrum so the model learns spectral *shape*
    (relative feature position/depth) rather than absolute brightness, which
    can vary with illumination/viewing geometry.
    """
    bands = band_columns(df)
    out = df.copy()
    spectra = out[bands].to_numpy()
    norms = np.linalg.norm(spectra, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    out[bands] = spectra / norms
    return out


def add_derivative_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add first-derivative (band-to-band difference) features. Spectral
    derivatives often sharpen absorption/reflectance features (e.g.
    chlorophyll dips) that raw reflectance blurs together.
    """
    bands = band_columns(df)
    out = df.copy()
    spectra = out[bands].to_numpy()
    deriv = np.diff(spectra, axis=1)
    deriv_cols = [f"deriv_{i}" for i in range(deriv.shape[1])]
    deriv_df = pd.DataFrame(deriv, columns=deriv_cols, index=out.index)
    return pd.concat([out, deriv_df], axis=1)


def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    """Full preprocessing pipeline: QC -> normalize -> derivative features."""
    df = quality_control(df)
    df = normalize_spectra(df)
    df = add_derivative_features(df)
    return df
