/**
 * Shared constants for the in-repo OCEANNOVA CNN engine.
 * These values define the contract between the training scripts (ml/),
 * the inference engine (lib/ml/engine.ts) and the API routes. Changing any
 * of them invalidates the shipped weights — retrain with `pnpm train`.
 */

/** Canonical ocean-color sampling grid: 32 log-spaced bands from 400 to 870 nm. */
export const BAND_GRID_NM: number[] = (() => {
  const n = 32;
  const lo = Math.log10(400);
  const hi = Math.log10(870);
  return Array.from({ length: n }, (_, i) => Math.round(10 ** (lo + ((hi - lo) * i) / (n - 1))));
})();

export const N_BANDS = BAND_GRID_NM.length;

/** CNN input length: N_BANDS SNV coefficients + 1 normalized global-energy feature
 *  (SNV removes amplitude, so oil-slick darkening is only visible through this term). */
export const N_FEATURES = N_BANDS + 1;

/** The seven cause classes the model was trained on. Index = class id. */
export const CAUSES = [
  "harmful_algal_bloom",
  "oil_spill",
  "eutrophication",
  "sediment_plume",
  "coastal_runoff",
  "thermal_anomaly",
  "unknown_mixed",
] as const;
export type Cause = (typeof CAUSES)[number];

export const CAUSE_LABELS: Record<Cause, string> = {
  harmful_algal_bloom: "Harmful Algal Bloom",
  oil_spill: "Oil Spill",
  eutrophication: "Eutrophication",
  sediment_plume: "Sediment Plume",
  coastal_runoff: "Coastal Runoff",
  thermal_anomaly: "Thermal Anomaly",
  unknown_mixed: "Unknown / Mixed",
};

/** Daily-window features fed to the ForecastCNN, in order. */
export const SERIES_FEATURES = ["chl_z", "sst_z", "kd_z", "wind", "wave", "doy_sin", "doy_cos"] as const;
export const N_SERIES_FEATURES = SERIES_FEATURES.length;

/** Days of history the forecaster looks at, and how far ahead it projects. */
export const LOOKBACK_DAYS = 14;
export const HORIZON_DAYS = 7;

export const MODEL_VERSION = "oceannova-cnn-6.1-tfjs";

/** Weight artifact layout, relative to the repo root. */
export const WEIGHTS_DIR = "ml/weights";

/** Regions the forecast layer scores with live (or cached) daily series.
 *  Keys match REGION_COORDS in lib/region-metrics.ts. */
export const FORECAST_REGIONS = [
  "Bay of Bengal",
  "Arabian Sea",
  "Gulf of Mexico",
  "North Pacific Gyre",
  "Great Barrier Reef",
  "Norwegian Sea",
  "Drake Passage",
  "East China Sea",
  "Caribbean Sea",
  "Benguela Current",
] as const;

/** CoastWatch ERDDAP griddap sources for the daily regional series. */
export const ERDDAP_BASE = "https://coastwatch.pfeg.noaa.gov/erddap";
export const ERDDAP_DATASETS = {
  chlor_a: { dataset: "erdMWchladtOceancolor", variable: "chlor_a", unit: "mg m^-3" },
  sst: { dataset: "erdMWsstdmurOceancolor", variable: "analysed_sst", unit: "deg C" },
  kd490: { dataset: "erdSIkgMa492mOceancolor", variable: "Kd_490", unit: "m^-1" },
} as const;

/** Anomaly thresholds used for labeling + UI badges (honest model config, not UI cosmetics). */
export const ANOMALY_SCORE_THRESHOLD = 55; // 0-100 detection head
export const RISK_PROBABILITY_THRESHOLD = 0.35; // ForecastCNN next-7-day probability
export const OOD_FORCED_UNKNOWN = 0.46; // max cause softmax below this → unknown_mixed
