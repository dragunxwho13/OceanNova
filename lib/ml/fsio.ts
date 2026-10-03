/**
 * Minimal filesystem IO handlers for TensorFlow.js (the pure-JS @tensorflow/tfjs
 * package ships only browser-oriented handlers). Used by the engine to load the
 * trained weights from ml/weights/ and by the training script to save them.
 *
 * Layout per model directory:
 *   model.json               — topology + weightSpecs + weightsManifest
 *   group1-shard1of1.bin     — raw fp32 weights, concatenated in spec order
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as tf from "@tensorflow/tfjs";

type WeightSpec = { name: string; shape: number[]; dtype: string };

type ModelJson = {
  modelTopology: object;
  format?: string;
  generatedBy?: string;
  weightSpecs: WeightSpec[];
  weightsManifest?: { paths: string[]; weights: { name: string; paths: string[] }[] }[];
};

export async function saveModelToDir(model: tf.LayersModel, dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const handler: tf.io.IOHandler = {
    save: async (artifacts) => {
      const weightData = artifacts.weightData as ArrayBuffer;
      const specs = (artifacts.weightSpecs ?? []) as WeightSpec[];
      const fileName = "group1-shard1of1.bin";
      const json: ModelJson = {
        modelTopology: artifacts.modelTopology as object,
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        weightSpecs: specs,
        weightsManifest: [{ paths: [""], weights: specs.map((w) => ({ name: w.name, paths: [fileName] })) }],
      };
      fs.writeFileSync(path.join(dir, "model.json"), JSON.stringify(json));
      fs.writeFileSync(path.join(dir, fileName), new Uint8Array(weightData));
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
    },
  };
  await model.save(handler);
}

export async function loadModelFromDir(dir: string): Promise<tf.LayersModel> {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "model.json"), "utf8")) as ModelJson;
  const files: string[] = [];
  for (const group of raw.weightsManifest ?? []) {
    for (const entry of group.weights) {
      for (const p of entry.paths) if (!files.includes(p)) files.push(p);
    }
  }
  const buffers = files.map((f) => new Uint8Array(fs.readFileSync(path.join(dir, f))));
  const total = buffers.reduce((a, b) => a + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    merged.set(b, offset);
    offset += b.byteLength;
  }
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: raw.modelTopology,
      // fromMemory re-derives byte offsets from weightSpecs; the cast avoids
      // coupling to a private tfjs subpath for the spec type.
      weightSpecs: raw.weightSpecs as never,
      weightData: merged.buffer,
    }),
  );
}
