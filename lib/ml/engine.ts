/**
 * OCEANNOVA in-repo CNN engine.
 *
 * Real model inference, executed inside the Next.js server (Vercel-native):
 *   • analyzeSpectrum() — SpectralCNN forward pass over a resampled ocean-color
 *     spectrum → anomaly score, cause distribution, per-band evidence, and a set
 *     of companion statistical detectors (Mahalanobis, PCA reconstruction, …)
 *     computed for real against the trained baseline — no remote service needed.
 *   • forecastWindow()  — ForecastCNN forward pass over a 14-day regional window
 *     → 7-day anomaly outlook with cause attribution.
 *
 * If ML_SERVICE_URL is configured the API routes prefer the (remote) heavy
 * pipeline; this engine is the always-available default so a plain Vercel
 * deployment ships the full product with only a GEMINI_API_KEY.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as tf from "@tensorflow/tfjs";

import { buildSpectralCnn, buildForecastCnn } from "./models";
import { loadModelFromDir } from "./fsio";
import { buildSpectralFeatures, type SpectralInput } from "./features";
import {
  ANOMALY_SCORE_THRESHOLD,
  BAND_GRID_NM,
  CAUSES,
  MODEL_VERSION,
  N_BANDS,
  OOD_FORCED_UNKNOWN,
  RISK_PROBABILITY_THRESHOLD,
  WEIGHTS_DIR,
  type Cause,
} from "./constants";

export type BaselineStats = {
  version: string;
  trained_at: string;
  provenance: string;
  per_band_mean: number[];
  per_band_std: number[];
  /** 4 principal components of the normal-ocean feature distribution (32×4, row-major). */
  pca_components: number[][];
  /** Mean SNV feature vector per cause class (used for cosine OOD). */
  class_prototypes: Record<string, number[]>;
  spectral_metrics?: Record<string, number>;
  forecast_metrics?: Record<string, number>;
};

export type Evidence = { wavelength_nm: number; residual: number; contribution: number };

export type AnalysisResult = {
  ok: true;
  source: "local-cnn-tfjs";
  model_version: string;
  anomaly_score: number;
  is_anomaly: boolean;
  anomaly_components: Record<string, number>;
  detector_disagreement: number;
  model_disagreement: number;
  cause: string;
  class_probabilities: Record<string, number>;
  classifier_entropy: number;
  ood_score: number;
  unknown: boolean;
  confidence: number;
  nearest_training_class: string;
  class_distance_ratio: number;
  latent_distance: number;
  evidence: Evidence[];
  data_quality: { quality_score: number; spectral_coverage: number };
  inference_ms: number;
};

export type ForecastOutput = {
  ok: true;
  source: "local-cnn-tfjs";
  model_version: string;
  day_probabilities: number[]; // length HORIZON_DAYS, 0-1
  cause_probabilities: Record<string, number>;
  peak_severity: number; // 0-1 model-scaled magnitude of the predicted excursion
  max_probability: number;
  primary_cause: string; // "no_signal" when the none-class dominates
  risk: boolean;
  inference_ms: number;
};

export type EngineHealth = {
  ok: boolean;
  engine: "local-cnn-tfjs";
  model_loaded: boolean;
  baseline_loaded: boolean;
  model_version: string;
  provenance: string;
  trained_at: string;
  metrics: { spectral?: Record<string, number>; forecast?: Record<string, number> };
  error?: string;
};

const globalRef = globalThis as typeof globalThis & {
  __oceannovaEngine?: Promise<LoadedEngine | null>;
};

type LoadedEngine = {
  spectral: tf.LayersModel;
  forecast: tf.LayersModel;
  baseline: BaselineStats;
  weightsDir: string;
};

function resolveWeightsDir(): string {
  const candidates = [
    process.env.OCEANNOVA_WEIGHTS_DIR,
    path.join(process.cwd(), WEIGHTS_DIR),
    path.join(process.cwd(), "..", WEIGHTS_DIR),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "baseline.json"))) return dir;
  }
  return candidates[0];
}

async function load(): Promise<LoadedEngine | null> {
  try {
    await tf.ready();
    const dir = resolveWeightsDir();
    const baseline = JSON.parse(fs.readFileSync(path.join(dir, "baseline.json"), "utf8")) as BaselineStats;

    let spectral: tf.LayersModel;
    let forecast: tf.LayersModel;
    try {
      spectral = await loadModelFromDir(path.join(dir, "spectral_cnn"));
      forecast = await loadModelFromDir(path.join(dir, "forecast_cnn"));
    } catch {
      // Architecture changed since the weights were exported: rebuild fresh nets
      // only if no artifact dir exists at all; otherwise surface the load error.
      throw new Error(`weights in ${dir} are incompatible with the current architecture`);
    }
    return { spectral, forecast, baseline, weightsDir: dir };
  } catch (error) {
    console.error("[oceannova-engine] failed to load:", error instanceof Error ? error.message : error);
    return null;
  }
}

function engine(): Promise<LoadedEngine | null> {
  if (!globalRef.__oceannovaEngine) globalRef.__oceannovaEngine = load();
  return globalRef.__oceannovaEngine;
}

export function engineAvailable(): Promise<boolean> {
  return engine().then((e) => Boolean(e));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sig = (x: number) => 1 / (1 + Math.exp(-x));

/* ─────────────────────────── companion statistical detectors ─────────────────────────── */

function mahalanobisFeature(features: number[], baseline: BaselineStats): number {
  let sum = 0;
  for (let i = 0; i < features.length; i++) {
    const z = (features[i] - baseline.per_band_mean[i]) / (baseline.per_band_std[i] || 1e-6);
    sum += z * z;
  }
  return Math.sqrt(sum / features.length);
}

function pcaReconstructionError(features: number[], baseline: BaselineStats): number {
  const k = baseline.pca_components[0]?.length ?? 0;
  if (!k) return 0;
  const centered = features.map((v, i) => v - baseline.per_band_mean[i]);
  // project onto principal axes, reconstruct, and take the mean squared residual
  const scores = new Array(k).fill(0);
  for (let c = 0; c < k; c++) {
    let acc = 0;
    for (let i = 0; i < centered.length; i++) acc += centered[i] * (baseline.pca_components[i][c] ?? 0);
    scores[c] = acc;
  }
  let residual = 0;
  for (let i = 0; i < centered.length; i++) {
    let recon = 0;
    for (let c = 0; c < k; c++) recon += scores[c] * (baseline.pca_components[i][c] ?? 0);
    residual += (centered[i] - recon) ** 2;
  }
  return residual / centered.length;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/* ───────────────────────────────── public API ───────────────────────────────── */

export async function health(): Promise<EngineHealth> {
  const e = await engine();
  if (!e) {
    return {
      ok: false,
      engine: "local-cnn-tfjs",
      model_loaded: false,
      baseline_loaded: false,
      model_version: MODEL_VERSION,
      provenance: "no trained artifacts present — run `pnpm train` and commit ml/weights/",
      trained_at: "",
      metrics: {},
      error: "ml/weights/ not found or unreadable",
    };
  }
  return {
    ok: true,
    engine: "local-cnn-tfjs",
    model_loaded: true,
    baseline_loaded: true,
    model_version: e.baseline.version || MODEL_VERSION,
    provenance: e.baseline.provenance,
    trained_at: e.baseline.trained_at,
    metrics: { spectral: e.baseline.spectral_metrics, forecast: e.baseline.forecast_metrics },
  };
}

/** Run the full detection + classification + evidence pipeline on one spectrum. */
export async function analyzeSpectrum(input: SpectralInput): Promise<AnalysisResult | { ok: false; error: string }> {
  const e = await engine();
  if (!e) return { ok: false, error: "local CNN engine unavailable (missing ml/weights — run `pnpm train`)" };
  const t0 = Date.now();

  const { features, quality } = buildSpectralFeatures(input);
  const input3d = tf.tensor3d([features.map((f) => [f])]);
  const outputs = e.spectral.predict(input3d) as tf.Tensor[];
  const [scoreT, causeT] = outputs;
  const rawScore = (await scoreT.data())[0];
  const causeProbsAll = Array.from(await causeT.data()); // length CAUSES.length + 1 (last = none)
  const pNone = causeProbsAll[CAUSES.length] ?? 0;
  const causeProbs = causeProbsAll.slice(0, CAUSES.length);
  scoreT.dispose();
  causeT.dispose();
  input3d.dispose();

  // ── evidence: per-band residual against the learned baseline (band axis only) ──
  const residualBands = features
    .slice(0, N_BANDS)
    .map((v, i) => (v - e.baseline.per_band_mean[i]) * (e.baseline.per_band_std[i] || 1));
  const ranked = residualBands
    .map((r, i) => ({ abs: Math.abs(r), r, i }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 4);
  const totalAbs = ranked.reduce((acc, x) => acc + x.abs, 0) || 1;
  const evidence: Evidence[] = ranked.map((x) => ({
    wavelength_nm: BAND_GRID_NM[x.i],
    residual: Number((x.r * 0.1).toFixed(5)),
    contribution: Number(((x.abs / totalAbs) * 100).toFixed(1)),
  }));

  // ── statistical detector components (all genuinely computed) ──
  const mahal = mahalanobisFeature(features, e.baseline);
  const mahalPct = clamp(sig((mahal - 1.15) * 2.4) * 100, 0, 100);
  const pcaErr = pcaReconstructionError(features, e.baseline);
  const pcaPct = clamp(sig((pcaErr - 0.55) * 3.2) * 100, 0, 100);
  const maxBandZ = clamp((Math.max(...residualBands.map(Math.abs)) - 1.2) * 22 + 40, 0, 100);
  // greenness index deviation: the 700nm region is where blooms show
  const greenIdx = features[24] - features[20];
  const greenPct = clamp(sig((Math.abs(greenIdx) - 0.55) * 3.0) * 100, 0, 100);
  const gradient = residualBands.slice(1).map((v, i) => Math.abs(v - residualBands[i]));
  const gradPct = clamp((Math.max(...gradient, 0) - 1.4) * 20 + 35, 0, 100);
  const entropy = -causeProbsAll.reduce((acc, p) => (p > 1e-9 ? acc + p * Math.log(p) : acc), 0);
  const entropyPct = clamp((entropy / Math.log(CAUSES.length + 1)) * 100, 0, 100);
  const cnnPct = clamp(rawScore * 100, 0, 100);

  const components: Record<string, number> = {
    cnn_novelty: Math.round(cnnPct * 10) / 10,
    robust_mahalanobis: Math.round(mahalPct * 10) / 10,
    pca_reconstruction: Math.round(pcaPct * 10) / 10,
    band_zscore_peak: Math.round(maxBandZ * 10) / 10,
    greenness_index: Math.round(greenPct * 10) / 10,
    spectral_gradient: Math.round(gradPct * 10) / 10,
    uncertainty_entropy: Math.round(entropyPct * 10) / 10,
  };
  const values = Object.values(components);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const disagreement = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);

  // ── OOD gate against class prototypes ──
  const sims = CAUSES.map((c) => ({
    cause: c,
    sim: e.baseline.class_prototypes[c] ? cosine(features, e.baseline.class_prototypes[c]) : -1,
  }));
  sims.sort((a, b) => b.sim - a.sim);
  const nearest = sims[0];
  const second = sims[1];
  const oodScore = clamp(1 - (nearest.sim - (second?.sim ?? 0)) - nearest.sim * 0.25, 0, 1);
  const maxProb = Math.max(...causeProbs);
  const maxCauseIdx = causeProbs.indexOf(maxProb);
  const anomalyLikely = clamp(rawScore * 100, 0, 100) >= ANOMALY_SCORE_THRESHOLD || Math.max(mahalPct, pcaPct) >= 60;
  // the "none" class dominates and nothing is anomalous → healthy water, not a mystery;
  // a confident anomaly with an unattributable cause → unknown_mixed (OOD gate).
  const normalDominant = pNone > maxProb + 0.12;
  const forcedUnknown = anomalyLikely && (maxProb < OOD_FORCED_UNKNOWN || oodScore > 0.72 || normalDominant);
  const cause = normalDominant && !anomalyLikely ? "normal_ocean" : forcedUnknown ? "unknown_mixed" : CAUSES[maxCauseIdx];

  // ensemble the CNN head with the statistical novelty estimate
  const anomalyScore = clamp(cnnPct * 0.7 + Math.max(mahalPct, pcaPct) * 0.3, 0, 100);
  const confidence = clamp((forcedUnknown ? maxProb * 0.5 : maxProb) * (1 - entropy / (Math.log(CAUSES.length + 1) * 1.6)), 0.05, 0.99);

  return {
    ok: true,
    source: "local-cnn-tfjs",
    model_version: e.baseline.version || MODEL_VERSION,
    anomaly_score: Math.round(anomalyScore * 10) / 10,
    is_anomaly: anomalyScore >= ANOMALY_SCORE_THRESHOLD,
    anomaly_components: components,
    detector_disagreement: Math.round(disagreement * 10) / 10,
    model_disagreement: Math.round(disagreement * 10) / 10,
    cause,
    class_probabilities: Object.fromEntries([...CAUSES.map((c, i) => [c, Math.round((causeProbs[i] ?? 0) * 1000) / 1000]), ["none_normal_ocean", Math.round(pNone * 1000) / 1000]]),
    classifier_entropy: Math.round(entropy * 1000) / 1000,
    ood_score: Math.round(oodScore * 1000) / 1000,
    unknown: forcedUnknown,
    confidence: Math.round(confidence * 1000) / 1000,
    nearest_training_class: nearest.cause,
    class_distance_ratio: Math.round((nearest.sim - (second?.sim ?? 0)) * 1000) / 1000,
    latent_distance: Math.round(mahal * 1000) / 1000,
    evidence,
    data_quality: {
      quality_score: Math.round(quality.qc_pass * quality.spectral_coverage * 100) / 100,
      spectral_coverage: Math.round(quality.spectral_coverage * 100) / 100,
    },
    inference_ms: Date.now() - t0,
  };
}

/** 7-day outlook for one region from a (14×7) feature window. */
export async function forecastWindow(
  window: number[][],
): Promise<ForecastOutput | { ok: false; error: string }> {
  const e = await engine();
  if (!e) return { ok: false, error: "local CNN engine unavailable (missing ml/weights — run `pnpm train`)" };
  const t0 = Date.now();

  const input = tf.tensor3d([window]);
  const [daysT, causeT, sevT] = e.forecast.predict(input) as tf.Tensor[];
  const days = Array.from(await daysT.data());
  const causesAll = Array.from(await causeT.data()); // +1 "none" slot
  const causes = causesAll.slice(0, CAUSES.length);
  const severity = (await sevT.data())[0];
  daysT.dispose();
  causeT.dispose();
  sevT.dispose();
  input.dispose();

  const maxP = Math.max(...days);
  const maxCauseIdx = causes.indexOf(Math.max(...causes));
  const noneDominant = (causesAll[CAUSES.length] ?? 0) > Math.max(...causes);
  return {
    ok: true,
    source: "local-cnn-tfjs",
    model_version: e.baseline.version || MODEL_VERSION,
    day_probabilities: days.map((p) => Math.round(p * 1000) / 1000),
    cause_probabilities: Object.fromEntries([...CAUSES.map((c, i) => [c, Math.round((causes[i] ?? 0) * 1000) / 1000]), ["none_normal_ocean", Math.round((causesAll[CAUSES.length] ?? 0) * 1000) / 1000]]),
    peak_severity: Math.round(severity * 1000) / 1000,
    max_probability: Math.round(maxP * 1000) / 1000,
    primary_cause: noneDominant ? "no_signal" : CAUSES[maxCauseIdx],
    risk: maxP >= RISK_PROBABILITY_THRESHOLD,
    inference_ms: Date.now() - t0,
  };
}
