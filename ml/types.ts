/** Shared types for the training scripts. */

export type ForecastSet = {
  xs: number[][][]; // windows (samples × LOOKBACK_DAYS × features)
  dayY: number[][]; // per-horizon-day anomaly labels (0/1)
  causeY: number[]; // cause class index, -1 = no event in the future window
  severityY: number[]; // 0-1 peak severity
  real: boolean; // true when built from live ERDDAP data
};
