/**
 * Feature engineering shared by training (ml/) and the runtime engine
 * (lib/ml/engine.ts) so the CNN always consumes exactly what it was trained on.
 * Pure numeric functions — no I/O, no tf — so both sides can import them safely.
 */

import { BAND_GRID_NM, N_BANDS, N_FEATURES } from "./constants";

export type SpectralInput = {
  wavelengths_nm: number[];
  rrs: number[];
  latitude?: number;
  longitude?: number;
  sst_c?: number;
  chlor_a?: number;
  n_flh?: number;
  turbidity?: number;
};

export type SpectralFeatures = {
  /** N_BANDS log10-reflectance values, SNV-normalized — the CNN input vector. */
  features: number[];
  /** SNV residuals against the learned normal-ocean baseline mean (same length). */
  residuals: number[] | null;
  quality: {
    /** 0-1: fraction of the canonical grid covered by input samples. */
    spectral_coverage: number;
    /** 0-1: share of samples passing basic physical QC (positive, finite, plausible). */
    qc_pass: number;
    n_samples: number;
  };
};

/**
 * Resample (wavelengths, rrs) onto the canonical log-spaced grid with linear
 * interpolation between valid samples. Returns log10(reflectance) with zeros
 * nulled to the local median-ish value (nearest valid sample), like the PACE
 * QC path in the reference pipeline.
 */
export function resampleToGrid(wavelengths: number[], values: number[]): { grid: (number | null)[]; coverage: number } {
  const pts: [number, number][] = [];
  let ok = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    const wl = wavelengths[i];
    const v = values[i];
    if (!Number.isFinite(wl) || !Number.isFinite(v)) continue;
    if (wl < 350 || wl > 1100 || v < 0) continue;
    pts.push([wl, Math.log10(Math.max(v, 1e-6))]);
    ok++;
  }
  pts.sort((a, b) => a[0] - b[0]);
  const grid: (number | null)[] = new Array(N_BANDS).fill(null);
  if (pts.length >= 2) {
    for (let g = 0; g < N_BANDS; g++) {
      const target = BAND_GRID_NM[g];
      if (target < pts[0][0] || target > pts[pts.length - 1][0]) continue;
      // binary search for the bracketing samples
      let lo = 0;
      let hi = pts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid][0] <= target) lo = mid;
        else hi = mid;
      }
      const [w0, v0] = pts[lo];
      const [w1, v1] = pts[hi];
      const t = w1 === w0 ? 0 : (target - w0) / (w1 - w0);
      grid[g] = v0 + t * (v1 - v0);
    }
  }
  // fill remaining gaps from nearest valid neighbor (edge extension)
  for (let g = 0; g < N_BANDS; g++) {
    if (grid[g] !== null) continue;
    let d = 1;
    while (g - d < 0 && g + d >= N_BANDS) d++;
    const left = g - d >= 0 ? grid[g - d] : null;
    const right = g + d < N_BANDS ? grid[g + d] : null;
    grid[g] = left !== null ? left : right;
  }
  return { grid, coverage: N_BANDS === 0 ? 0 : grid.filter((x) => x !== null).length / N_BANDS };
}

/** Standard normal variate across the band axis. */
export function snv(values: number[]): number[] {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1e-9;
  return values.map((v) => (v - mean) / std);
}

/** Full spectral preprocessing → the fixed-width feature vector. */
export function buildSpectralFeatures(input: SpectralInput): SpectralFeatures {
  const { grid, coverage } = resampleToGrid(input.wavelengths_nm ?? [], input.rrs ?? []);
  const filled = grid.map((g) => g ?? 0);
  const snvSpectrum = snv(filled);
  // global energy term: log10 of mean raw reflectance, centered so clean open ocean ≈ 0.
  // Keeps amplitude-based signatures (oil darkening, dense bloom brightening) visible
  // after per-spectrum SNV normalization.
  const meanRaw = (input.rrs ?? []).filter((v) => Number.isFinite(v) && v > 0);
  const meanLin = meanRaw.length ? meanRaw.reduce((a, b) => a + b, 0) / meanRaw.length : 1e-4;
  const energy = (Math.log10(Math.max(meanLin, 1e-7)) + 4) / 0.5;
  const features = [...snvSpectrum, Math.max(-5, Math.min(9, energy))];

  const good = (input.rrs ?? []).filter((v) => Number.isFinite(v) && v >= 0).length;
  const total = Math.max(1, input.rrs?.length ?? 0);

  return {
    features, // length N_FEATURES
    residuals: null,
    quality: { spectral_coverage: Math.min(1, coverage), qc_pass: good / total, n_samples: input.wavelengths_nm?.length ?? 0 },
  };
}

/* ───────────────────────── time-series features (ForecastCNN) ───────────────────────── */

export type DailySample = {
  date: string;
  chlor_a: number | null;
  sst_c: number | null;
  kd490: number | null;
  wind_ms: number | null;
  wave_m: number | null;
};

function doy(date: string): number {
  const d = new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

/**
 * Turn a chronological daily series into the fixed (LOOKBACK_DAYS × features) window:
 * rolling z-scores computed from the FIRST 7 days (climatological anchor window),
 * normalized sea state, and cyclical day-of-year encoding. Missing days are
 * nearest-filled; the anchor mean/std are returned so callers can explain
 * "vs. what baseline" without re-deriving it.
 */
export function buildSeriesWindow(series: DailySample[], lookbackDays: number): {
  window: number[][];
  anchor: Record<"chlor_a" | "sst_c" | "kd490", { mean: number; std: number }>;
} {
  const recent = series.slice(-lookbackDays);
  // nearest-fill nulls
  const fill = (key: "chlor_a" | "sst_c" | "kd490" | "wind_ms" | "wave_m") => {
    const arr = recent.map((s) => s[key]);
    let prev = arr.find((x) => x != null) ?? 0;
    return arr.map((x) => {
      if (x != null) prev = x;
      return prev;
    });
  };
  const chl = fill("chlor_a");
  const sst = fill("sst_c");
  const kd = fill("kd490");
  const wind = fill("wind_ms");
  const wave = fill("wave_m");

  const anchorLen = Math.min(7, recent.length);
  const stats = (a: number[]) => {
    const anchor = a.slice(0, anchorLen);
    const mean = anchor.reduce((x, y) => x + y, 0) / Math.max(1, anchor.length);
    const raw = Math.sqrt(anchor.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, anchor.length));
    // floor: on near-constant series tiny seasonal drift would otherwise blow up into
    // huge z-scores and fabricate fake risk; 10% of level is our physical noise floor.
    return { mean, std: Math.max(raw, 0.1 * Math.abs(mean) + 1e-3) };
  };
  const sc = stats(chl);
  const ss = stats(sst);
  const sk = stats(kd);

  const win: number[][] = [];
  for (let i = 0; i < recent.length; i++) {
    const d = doy(recent[i].date ?? new Date().toISOString());
    win.push([
      (chl[i] - sc.mean) / sc.std,
      (sst[i] - ss.mean) / ss.std,
      (kd[i] - sk.mean) / sk.std,
      Math.min(1, (wind[i] ?? 0) / 25),
      Math.min(1, (wave[i] ?? 0) / 12),
      Math.sin((2 * Math.PI * d) / 365.25),
      Math.cos((2 * Math.PI * d) / 365.25),
    ]);
  }
  // pad to exact length (older data missing at the start) by duplicating the first row
  while (win.length < lookbackDays) win.unshift(win[0] ?? new Array(7).fill(0));
  return {
    window: win.slice(-lookbackDays),
    anchor: { chlor_a: sc, sst_c: ss, kd490: sk },
  };
}
