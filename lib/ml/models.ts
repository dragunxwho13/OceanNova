/**
 * CNN architectures for the OCEANNOVA in-repo engine, built with TensorFlow.js
 * (pure JS / CPU backend) so the exact same model definition runs in the
 * training script and inside Vercel serverless API routes.
 *
 *  - SpectralCNN  : 1-D convolutions over the 32-band ocean-color vector →
 *                   anomaly score + cause distribution (detection + classification trunk shared).
 *  - ForecastCNN  : 1-D temporal convolutions over a 14-day × 7-feature window →
 *                   7-day outlook probabilities + expected cause + peak severity.
 *
 * Both are deliberately small (tens of thousands of params) so cold-start load +
 * inference stay comfortably inside a serverless request budget.
 */

import * as tf from "@tensorflow/tfjs";
import { HORIZON_DAYS, CAUSES, N_FEATURES, N_SERIES_FEATURES, LOOKBACK_DAYS } from "./constants";

export function buildSpectralCnn(): tf.LayersModel {
  const input = tf.input({ shape: [N_FEATURES, 1] });
  let x = tf.layers
    .conv1d({ filters: 12, kernelSize: 5, padding: "same", activation: "relu", name: "conv_a" })
    .apply(input) as tf.SymbolicTensor;
  x = tf.layers.maxPooling1d({ poolSize: 2, name: "pool_a" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers
    .conv1d({ filters: 24, kernelSize: 3, padding: "same", activation: "relu", name: "conv_b" })
    .apply(x) as tf.SymbolicTensor;
  x = tf.layers.globalAveragePooling1d({}).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 24, activation: "relu", name: "latent" }).apply(x) as tf.SymbolicTensor;

  const anomaly = tf.layers.dense({ units: 1, activation: "sigmoid", name: "anomaly" }).apply(x) as tf.SymbolicTensor;
  // CAUSES.length + 1: the extra slot is the explicit "none / normal ocean" class, which
  // keeps the cause head from teaching "normal looks like unknown_mixed" (FPR poison).
  const cause = tf.layers
    .dense({ units: CAUSES.length + 1, activation: "softmax", name: "cause" })
    .apply(x) as tf.SymbolicTensor;

  return tf.model({ inputs: input, outputs: [anomaly, cause], name: "SpectralCNN" });
}

export function buildForecastCnn(): tf.LayersModel {
  const input = tf.input({ shape: [LOOKBACK_DAYS, N_SERIES_FEATURES] });
  let x = tf.layers
    .conv1d({ filters: 16, kernelSize: 3, padding: "same", activation: "relu", name: "fconv_a" })
    .apply(input) as tf.SymbolicTensor;
  x = tf.layers
    .conv1d({ filters: 32, kernelSize: 3, padding: "same", activation: "relu", name: "fconv_b" })
    .apply(x) as tf.SymbolicTensor;
  x = tf.layers
    .conv1d({ filters: 32, kernelSize: 3, padding: "same", activation: "relu", name: "fconv_c" })
    .apply(x) as tf.SymbolicTensor;
  x = tf.layers.flatten().apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 48, activation: "relu", name: "fcontext" }).apply(x) as tf.SymbolicTensor;

  const days = tf.layers
    .dense({ units: HORIZON_DAYS, activation: "sigmoid", name: "day_probability" })
    .apply(x) as tf.SymbolicTensor;
  const cause = tf.layers
    .dense({ units: CAUSES.length + 1, activation: "softmax", name: "cause_distribution" })
    .apply(x) as tf.SymbolicTensor;
  const severity = tf.layers.dense({ units: 1, activation: "sigmoid", name: "peak_severity" }).apply(x) as tf.SymbolicTensor;

  return tf.model({ inputs: input, outputs: [days, cause, severity], name: "ForecastCNN" });
}
