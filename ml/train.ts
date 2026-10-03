/**
 * OCEANNOVA CNN training entry point.
 *
 *   pnpm train                     # auto: real ERDDAP data if reachable, else synthetic
 *   pnpm train --source synthetic  # fully offline, reproducible
 *   pnpm train --source erddap     # force real CoastWatch series (forecast net)
 *   pnpm train --epochs 60
 *
 * Writes ml/weights/{baseline.json,manifest.json,spectral_cnn/,forecast_cnn/}.
 * Commit that folder and the engine loads it everywhere — dev, Vercel, preview.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as tf from "@tensorflow/tfjs";

import { buildSpectralCnn, buildForecastCnn } from "../lib/ml/models";
import { saveModelToDir } from "../lib/ml/fsio";
import { CAUSES, LOOKBACK_DAYS, MODEL_VERSION, N_BANDS, WEIGHTS_DIR } from "../lib/ml/constants";
import { makeSpectralSet, makeForecastSet, mulberry32 } from "./synth";
import { buildRealForecastSet } from "./realdata";
import type { ForecastSet } from "./types";

/* ───────────────────────── args ───────────────────────── */
const argv = process.argv.slice(2);
const arg = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const source = arg("source", "auto");
const EPOCHS = Number(arg("epochs", process.env.TRAIN_EPOCHS ?? "30"));
const SPECTRAL_N = Number(arg("spectral-samples", "5600"));
const FORECAST_N = Number(arg("forecast-samples", "3200"));
// compiled layout is .cache/ml-build/ml/train.js → three up from __dirname is the repo root
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.resolve(process.env.TRAIN_OUTPUT_DIR ?? path.join(REPO_ROOT, WEIGHTS_DIR));

/* ───────────────────────── helpers ───────────────────────── */

/** k principal axes of X (mean already removed) via orthogonal power iteration.
 * Returns rows = components, each a length-m vector (comps[c][band]). */
function topComponents(x: number[][], k: number): number[][] {
  const m: number = x[0].length;
  const cov: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (const row of x) {
    for (let i = 0; i < m; i++) {
      for (let j = i; j < m; j++) cov[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      cov[i][j] = cov[i][j] / x.length;
      cov[j][i] = cov[i][j];
    }
  }
  const comps: number[][] = [];
  for (let c = 0; c < k; c++) {
    let v: number[] = new Array<number>(m).fill(0).map((_, i) => Math.sin(i * (c + 2) * 1.7) + 0.1);
    for (let it = 0; it < 300; it++) {
      const nv: number[] = cov.map((row) => {
        let acc = 0;
        for (let i = 0; i < m; i++) acc += row[i] * v[i];
        return acc;
      });
      for (const prev of comps) {
        let d = 0;
        for (let i = 0; i < m; i++) d += nv[i] * prev[i];
        for (let i = 0; i < m; i++) nv[i] -= d * prev[i];
      }
      let n2 = 0;
      for (let i = 0; i < m; i++) n2 += nv[i] * nv[i];
      const norm = Math.sqrt(n2) || 1e-9;
      v = nv.map((x2) => x2 / norm);
    }
    comps.push(v);
  }
  return comps;
}

const transpose = (rows: number[][]): number[][] => rows[0]?.map((_, i) => rows.map((r) => r[i])) ?? [];

const meanVec = (rows: number[][]) => {
  const m = rows[0]?.length ?? 0;
  if (!rows.length) return new Array(m).fill(0);
  const out = new Array(m).fill(0);
  for (const r of rows) for (let i = 0; i < m; i++) out[i] += r[i] / rows.length;
  return out;
};

/* ───────────────────────── spectral training ───────────────────────── */

async function trainSpectral(): Promise<{ perBandMean: number[]; perBandStd: number[]; pca: number[][]; prototypes: Record<string, number[]>; metrics: Record<string, number>; featLen: number }> {
  console.log(`[spectral] building ${SPECTRAL_N} synthetic physical samples…`);
  const set = makeSpectralSet(SPECTRAL_N, 7);
  const idx = [...set.xs.keys()];
  const rng = mulberry32(99);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const xs = idx.map((i) => set.xs[i]);
  const a = idx.map((i) => set.anomaly[i]);
  const c = idx.map((i) => set.cause[i]);
  const tr = Math.floor(xs.length * 0.85);
  const trX = xs.slice(0, tr);
  const trA = a.slice(0, tr);
  const trC = c.slice(0, tr);
  const teX = xs.slice(tr);
  const teA = a.slice(tr);
  const teC = c.slice(tr);

  // baseline stats from NORMAL class only — that's the "expected ocean" model
  const normalRows = trX.filter((_, i) => trA[i] === 0);
  const F = trX[0].length; // N_FEATURES (bands + energy)
  const perBandMean = new Array<number>(F).fill(0);
  for (const row of normalRows) for (let i = 0; i < F; i++) perBandMean[i] += row[i] / normalRows.length;
  const varPerBand = new Array<number>(F).fill(0);
  for (const row of normalRows) for (let i = 0; i < F; i++) varPerBand[i] += (row[i] - perBandMean[i]) ** 2 / normalRows.length;
  const perBandStd = varPerBand.map((v) => Math.sqrt(v) || 1e-6);
  const centered = normalRows.map((r) => r.map((v, i) => v - perBandMean[i]));
  const pca = topComponents(centered, 4);

  const prototypes: Record<string, number[]> = {};
  for (let ci = 0; ci < CAUSES.length; ci++) {
    const rows = trX.filter((_, i) => trC[i] === ci);
    prototypes[CAUSES[ci]] = rows.length ? meanVec(rows) : meanVec(normalRows);
  }

  const model = buildSpectralCnn();
  model.compile({
    optimizer: tf.train.adam(0.004),
    loss: { anomaly: "binaryCrossentropy", cause: "categoricalCrossentropy" },
    metrics: { anomaly: ["accuracy"], cause: ["accuracy"] } as never,
  });

  const xT = tf.tensor3d(trX.map((f) => f.map((v) => [v])) as never, [trX.length, trX[0].length, 1]);
  const yA = tf.tensor2d(trA.map((v) => [v]));
  const oneHot = (idx: number) => {
    const row = new Array<number>(CAUSES.length + 1).fill(0);
    row[idx < 0 ? CAUSES.length : idx] = 1; // last slot = "none / normal ocean"
    return row;
  };
  const yC = tf.tensor2d(trC.map(oneHot));

  console.log("[spectral] training…");
  const hist = await model.fit(xT, { anomaly: yA, cause: yC }, {
    epochs: EPOCHS,
    batchSize: 64,
    shuffle: true,
    validationSplit: 0.12,
    callbacks: { onEpochEnd: (e, logs) => { if ((e + 1) % 5 === 0) console.log(`  epoch ${e + 1}/${EPOCHS} loss=${logs?.loss?.toFixed(4)} accA=${logs?.["anomaly_accuracy"]?.toFixed(3)} accC=${logs?.["cause_accuracy"]?.toFixed(3)}`); } },
  });
  xT.dispose();
  yA.dispose();
  yC.dispose();

  // evaluate on held-out split
  const xTe = tf.tensor3d(teX.map((f) => f.map((v) => [v])) as never, [teX.length, teX[0].length, 1]);
  const [pA, pC] = model.predict(xTe, { batchSize: 256 }) as tf.Tensor[];
  const aData = Array.from(await pA.data());
  const cIdx = Array.from(await pC.argMax(1).data());
  pA.dispose();
  pC.dispose();
  xTe.dispose();
  let tp = 0; let fp = 0; let fn = 0; let correct = 0;
  const normalCount = teX.filter((_, i) => teA[i] === 0).length;
  const normalCorrect = teX.filter((_, i) => teA[i] === 0 && aData[i] < 0.5).length;
  for (let i = 0; i < teA.length; i++) {
    const pred = aData[i] >= 0.5 ? 1 : 0;
    if (pred === 1 && teA[i] === 1) tp++;
    else if (pred === 1) fp++;
    else if (teA[i] === 1) fn++;
    if (teC[i] < 0 ? cIdx[i] === CAUSES.length : cIdx[i] === teC[i]) correct++;
  }
  const metrics = {
    anomaly_precision: Number((tp / Math.max(1, tp + fp)).toFixed(3)),
    anomaly_recall: Number((tp / Math.max(1, tp + fn)).toFixed(3)),
    normal_false_positive_rate: Number((1 - normalCorrect / Math.max(1, normalCount)).toFixed(3)),
    cause_accuracy: Number((correct / Math.max(1, teA.length)).toFixed(3)),
    val_loss: Number(hist.history["val_loss"]?.at(-1) ?? hist.history.loss?.at(-1) ?? 0),
  };
  console.log("[spectral] holdout metrics:", JSON.stringify(metrics));

  const dir = path.join(OUT_DIR, "spectral_cnn");
  await saveModelToDir(model, dir);
  return { perBandMean, perBandStd, pca, prototypes, metrics, featLen: F };
}

/* ───────────────────────── forecast training ───────────────────────── */

async function trainForecast(): Promise<{ precision_7day: number; recall_7day: number; val_loss: number; train_windows: number; holdout_windows: number; trained_on: string }> {
  let real = null as ForecastSet | null;
  if (source !== "synthetic") {
    console.log("[forecast] attempting real CoastWatch ERDDAP series…");
    real = await buildRealForecastSet(1200).catch(() => null);
  }
  let usedReal = false;
  let set: ForecastSet;
  if (real && real.xs.length >= 150) {
    set = real;
    usedReal = true;
    console.log(`[forecast] using ${real.xs.length} real weak-labeled windows`);
  } else {
    if (source === "erddap") console.warn("[forecast] ERDDAP unreachable/sparse — falling back to synthetic");
    console.log(`[forecast] building ${FORECAST_N} synthetic windows…`);
    set = { ...makeForecastSet(FORECAST_N, 21), real: false };
  }

  const { xs, dayY, causeY, severityY } = set;
  const cut = Math.floor(xs.length * 0.85);
  const model = buildForecastCnn();
  model.compile({
    optimizer: tf.train.adam(0.003),
    loss: { day_probability: "binaryCrossentropy", cause_distribution: "categoricalCrossentropy", peak_severity: "meanSquaredError" },
  });

  const xT = tf.tensor3d(xs.slice(0, cut) as never);
  const yD = tf.tensor2d(dayY.slice(0, cut));
  const yC = tf.tensor2d(causeY.slice(0, cut).map((v) => {
    const row = new Array<number>(CAUSES.length + 1).fill(0);
    row[v < 0 ? CAUSES.length : v] = 1; // none-event windows get the explicit "none" class
    return row;
  }));
  const yS = tf.tensor2d(severityY.slice(0, cut).map((v) => [v]));

  console.log(`[forecast] training (epochs=${EPOCHS}, windows=${cut})…`);
  const hist = await model.fit(xT, { day_probability: yD, cause_distribution: yC, peak_severity: yS }, {
    epochs: EPOCHS,
    batchSize: 64,
    shuffle: true,
    validationSplit: 0.15,
    callbacks: { onEpochEnd: (e, logs) => { if ((e + 1) % 5 === 0) console.log(`  epoch ${e + 1}/${EPOCHS} loss=${logs?.loss?.toFixed(4)} val=${logs?.["val_loss"]?.toFixed(4)}`); } },
  });
  xT.dispose(); yD.dispose(); yC.dispose(); yS.dispose();

  // horizon-detection stats on holdout
  const xTe = tf.tensor3d(xs.slice(cut) as never);
  const [pD] = model.predict(xTe, { batchSize: 256 }) as tf.Tensor[];
  const pd = Array.from(await pD.data());
  pD.dispose();
  const H = dayY[0].length;
  let tp = 0; let fp = 0; let fn = 0;
  for (let s = 0; s < dayY.slice(cut).length; s++) {
    const anyPred = pd.slice(s * H, s * H + H).some((v) => v >= 0.35);
    const anyTrue = dayY.slice(cut)[s].some((v) => v === 1);
    if (anyPred && anyTrue) tp++;
    else if (anyPred) fp++;
    else if (anyTrue) fn++;
  }
  const metrics = {
    precision_7day: Number((tp / Math.max(1, tp + fp)).toFixed(3)),
    recall_7day: Number((tp / Math.max(1, tp + fn)).toFixed(3)),
    val_loss: Number(hist.history["val_loss"]?.at(-1) ?? 0),
    train_windows: cut,
    holdout_windows: dayY.length - cut,
    trained_on: usedReal ? "noaa_coastwatch_erddap_weak_labels" : "synthetic_physics_generator",
  };
  console.log("[forecast] holdout metrics:", JSON.stringify(metrics));
  await saveModelToDir(model, path.join(OUT_DIR, "forecast_cnn"));
  return metrics;
}

/* ───────────────────────── main ───────────────────────── */

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await tf.ready();
  console.log(`[train] tfjs backend=${tf.getBackend()} → ${OUT_DIR}`);

  const stages = arg("stages", "both");
  const priorPath = path.join(OUT_DIR, "baseline.json");
  type Prior = {
    per_band_mean: number[];
    per_band_std: number[];
    pca_components: number[][];
    class_prototypes: Record<string, number[]>;
    spectral_metrics?: Record<string, number>;
    forecast_metrics?: { precision_7day: number; recall_7day: number; val_loss: number; train_windows: number; holdout_windows: number; trained_on: string };
  };
  const prior: Prior | null = fs.existsSync(priorPath) ? (JSON.parse(fs.readFileSync(priorPath, "utf8")) as Prior) : null;
  const spectral =
    stages === "forecast-only"
      ? {
          perBandMean: prior?.per_band_mean ?? [],
          perBandStd: prior?.per_band_std ?? [],
          pca: prior?.pca_components?.[0] ? transpose(prior.pca_components) : [],
          prototypes: prior?.class_prototypes ?? {},
          metrics: prior?.spectral_metrics ?? {},
          featLen: prior?.pca_components?.length ?? 0,
        }
      : await trainSpectral();
  const forecast =
    stages === "spectral-only"
      ? (prior?.forecast_metrics ?? { precision_7day: 0, recall_7day: 0, val_loss: 0, train_windows: 0, holdout_windows: 0, trained_on: "unknown (carried over from previous weights)" })
      : await trainForecast();

  // transpose pca columns to row-per-feature layout for the engine
  const pcaRows: number[][] = Array.from({ length: spectral.featLen }, (_, i) => spectral.pca.map((col) => col[i]));
  const baseline = {
    version: MODEL_VERSION,
    trained_at: new Date().toISOString(),
    provenance: `SpectralCNN: ${SPECTRAL_N} synthetic physical samples (PACE OCI band shapes; SNV log10 Rrs on ${N_BANDS}-band grid). ForecastCNN: ${forecast.trained_on}.`,
    per_band_mean: spectral.perBandMean.map((v) => Number(v.toFixed(5))),
    per_band_std: spectral.perBandStd.map((v) => Number(v.toFixed(5))),
    pca_components: pcaRows.map((r) => r.map((v) => Number(v.toFixed(5)))),
    class_prototypes: Object.fromEntries(Object.entries(spectral.prototypes).map(([k, v]) => [k, v.map((x) => Number(x.toFixed(4)))])),
    spectral_metrics: spectral.metrics,
    forecast_metrics: forecast,
  };
  fs.writeFileSync(path.join(OUT_DIR, "baseline.json"), JSON.stringify(baseline));
  const sizes = {
    spectral: fs.statSync(path.join(OUT_DIR, "spectral_cnn", "model.json")).size,
    forecast: fs.statSync(path.join(OUT_DIR, "forecast_cnn", "model.json")).size,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ model_version: MODEL_VERSION, generated_at: baseline.trained_at, architecture: "tfjs/layers conv1d", inputShapes: { spectral: [N_BANDS, 1], forecast: [LOOKBACK_DAYS, 7] }, sizes, elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(1)) }, null, 2),
  );
  console.log(`[train] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — weights + baseline written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
