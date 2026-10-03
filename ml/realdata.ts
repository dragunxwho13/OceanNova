/**
 * Real-data builder for ForecastCNN: pulls daily regional time series from
 * public NOAA CoastWatch ERDDAP (same endpoints lib/ml/data.ts uses at
 * runtime — no API key) and weak-labels windows with the z-score rule the
 * README describes for PACE L2 pixels. Runs wherever the network is open
 * (your laptop / the deploy pipeline); train.ts falls back to the synthetic
 * generator automatically when feeds are unreachable.
 */

import { getAllRegionSeries } from "../lib/ml/data";
import { buildSeriesWindow } from "../lib/ml/features";
import { CAUSES, HORIZON_DAYS, LOOKBACK_DAYS, type Cause } from "../lib/ml/constants";
import type { ForecastSet } from "./types";

const Z_EVENT = 2.2;

function stats(a: number[]) {
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const std = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length) || 1e-6;
  return { mean, std };
}

/** Rolling z-series over the whole available history (anchor = first 7 days). */
function columnZ(values: (number | null)[]): number[] {
  const filled = values.map((v) => v ?? 0);
  const { mean, std } = stats(filled.slice(0, Math.min(7, filled.length)));
  return filled.map((v) => (v - mean) / std);
}

/** Weak labeling rules for the cause, consistent with the README's heuristic layer. */
function ruleCause(zChl: number, zSst: number, zKd: number): Cause {
  if (zChl >= Z_EVENT && zKd >= 1.2) return "coastal_runoff";
  if (zChl >= Z_EVENT && zSst > 0.4 && zSst < 2.5) return "harmful_algal_bloom";
  if (zChl >= Z_EVENT) return "eutrophication";
  if (zKd >= Z_EVENT) return "sediment_plume";
  if (zSst >= 2.0) return "thermal_anomaly";
  if (zSst <= -2.0 && zChl < 0) return "oil_spill"; // darkening + cold film signature
  return "unknown_mixed";
}

export async function buildRealForecastSet(maxWindows = 900): Promise<ForecastSet | null> {
  try {
    const regions = await getAllRegionSeries();
    const xs: number[][][] = [];
    const dayY: number[][] = [];
    const causeY: number[] = [];
    const severityY: number[] = [];
    for (const region of regions) {
      // reuse the fetched daily samples; extend conceptually by scanning every
      // possible window (real deployments can grow the ERDDAP window in data.ts)
      const series = region.series;
      if (series.length < LOOKBACK_DAYS + 2) continue;
      const zChl = columnZ(series.map((s) => s.chlor_a));
      const zSst = columnZ(series.map((s) => s.sst_c));
      const zKd = columnZ(series.map((s) => s.kd490));
      for (let end = LOOKBACK_DAYS; end <= series.length; end++) {
        const { window } = buildSeriesWindow(series.slice(0, end), LOOKBACK_DAYS);
        const labels: number[] = [];
        for (let d = 1; d <= HORIZON_DAYS; d++) {
          const idx = end - 1 + d;
          const z = idx < zChl.length ? Math.abs(zChl[idx]) : 0;
          labels.push(z >= Z_EVENT ? 1 : 0);
        }
        const lastIdx = end - 1;
        const anyToday = Math.abs(zChl[lastIdx]) >= Z_EVENT;
        xs.push(window);
        dayY.push(labels);
        causeY.push(anyToday ? CAUSES.indexOf(ruleCause(zChl[lastIdx], zSst[lastIdx], zKd[lastIdx])) : -1);
        severityY.push(anyToday ? Math.min(1, Math.abs(zChl[lastIdx]) / 6) : 0.05);
        if (xs.length >= maxWindows) return finalize(xs, dayY, causeY, severityY);
      }
    }
    if (xs.length < 150) return null; // too sparse to be useful — fall back to synthetic
    return finalize(xs, dayY, causeY, severityY);
  } catch (error) {
    console.warn("[realdata] ERDDAP unavailable, falling back to synthetic:", error instanceof Error ? error.message : error);
    return null;
  }
}

function finalize(xs: number[][][], dayY: number[][], causeY: number[], severityY: number[]): ForecastSet {
  return { xs, dayY, causeY, severityY, real: true };
}
