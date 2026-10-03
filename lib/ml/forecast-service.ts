/**
 * Forecast service: glues the daily regional series (lib/ml/data.ts) to the
 * ForecastCNN (lib/ml/engine.ts), attaches real evidence numbers, and asks
 * Gemini 2.5 Flash (the project's only model API) to phrase the result for
 * operators. Cached per horizon; every field says where it came from.
 */

import { z } from "zod";
import { generateGeminiJson } from "@/lib/gemini";
import { forecastWindow, type ForecastOutput } from "@/lib/ml/engine";
import { buildSeriesWindow, type DailySample } from "@/lib/ml/features";
import { getAllRegionSeries, type RegionSeries } from "@/lib/ml/data";
import { CAUSES, CAUSE_LABELS, HORIZON_DAYS, LOOKBACK_DAYS, RISK_PROBABILITY_THRESHOLD, type Cause } from "@/lib/ml/constants";

export type RegionOutlook = {
  region: string;
  coordinates: [number, number];
  source: RegionSeries["source"];
  updatedAt: string;
  detail: string;
  risk: boolean;
  probability: number; // 0-100, max over horizon
  peakDay: number; // 1-indexed day within horizon
  horizonLabel: string;
  cause: string; // Cause or "no_signal"
  causeProbabilities: Record<string, number>;
  peakSeverity: number; // 0-1, model-scaled
  dayProbabilities: number[];
  evidence: string[];
  explanation?: string;
  explanationSource?: "gemini-2.5-flash" | "model-summary";
  forecastModel: string;
  inferenceMs: number;
};

type ExplanationOut = { headline: string; reasoning: string };

const ExplanationSchema = z.object({ headline: z.string().min(3).max(140), reasoning: z.string().min(20).max(900) });

function evidenceStrings(region: RegionSeries, out: ForecastOutput): string[] {
  const series = region.series;
  const last = series[series.length - 1];
  const first7 = series.slice(0, 7);
  const mean = (a: (number | null)[]) => {
    const v = a.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const baseChl = mean(first7.map((s) => s.chlor_a));
  const curChl = last.chlor_a;
  const baseSst = mean(first7.map((s) => s.sst_c));
  const curSst = last.sst_c;
  const lines: string[] = [];
  if (baseChl != null && curChl != null) {
    lines.push(`surface chlorophyll ${curChl.toFixed(2)} mg m⁻³ vs ${baseChl.toFixed(2)} early-window mean (${((curChl / baseChl - 1) * 100).toFixed(0)}% change)`);
  }
  if (baseSst != null && curSst != null) {
    lines.push(`SST ${curSst.toFixed(1)}°C vs ${baseSst.toFixed(1)}°C early-window baseline (${curSst - baseSst >= 0 ? "+" : ""}${(curSst - baseSst).toFixed(1)}°C)`);
  }
  const trend = series.slice(-4).map((s: DailySample) => s.chlor_a).filter((x): x is number => x != null);
  if (trend.length >= 3) {
    const slope = ((trend[trend.length - 1] - trend[0]) / Math.max(1, trend[0])) * 100;
    lines.push(`chlorophyll trajectory over the last 4 days: ${slope >= 0 ? "+" : ""}${slope.toFixed(0)}% per ${trend.length - 1}-day step`);
  }
  lines.push(`ForecastCNN peak day ${out.day_probabilities.indexOf(Math.max(...out.day_probabilities)) + 1} of ${HORIZON_DAYS} (${(Math.max(...out.day_probabilities) * 100).toFixed(0)}% probability, ${region.source} input window)`);
  return lines.slice(0, 4);
}

function modelSummary(out: ForecastOutput, ev: string[]): string {
  if (out.primary_cause === "no_signal") {
    return `The regional time-series CNN sees no elevated anomaly likelihood in the next ${HORIZON_DAYS} days (peak ${Math.round(out.max_probability * 100)}%). ${ev[0] ? `Observed drivers remain within range: ${ev[0]}.` : ""}`.trim();
  }
  const label = CAUSE_LABELS[out.primary_cause as Cause] ?? out.primary_cause.replaceAll("_", " ");
  return [
    `The regional time-series CNN places a ${Math.round(out.max_probability * 100)}% probability of an anomaly (most likely class: ${label.toLowerCase()}) developing within the next ${HORIZON_DAYS} days.`,
    ev[0] ? `Observed drivers: ${ev[0]}.` : "",
    out.peak_severity > 0.6
      ? "Predicted excursion magnitude is above the mid-range — worth an in-situ check or a zoomed satellite pass."
      : "Predicted excursion magnitude is modest; continue routine monitoring.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function explain(region: string, out: ForecastOutput, ev: string[]): Promise<{ text: string; via: RegionOutlook["explanationSource"] }> {
  const fallback = { text: modelSummary(out, ev), via: "model-summary" as const };
  const probs = CAUSES.map((c) => `${c}: ${Math.round(((out.cause_probabilities[c] ?? 0) as number) * 100)}%`).join(", ");
  const prompt = `You are a cautious ocean-forecast analyst for OCEANNOVA. A ForecastCNN model produced the numbers below from a 14-day regional ocean-color window. Do NOT invent measurements, coordinates or dates; use only the supplied evidence. Attribute outcomes to model likelihood, never certainty. Return JSON: {"headline": "<=12 words", "reasoning": "2-4 sentences: what the model predicts, which observed signals drive it, what would confirm or refute it."}\n\nRegion: ${region}\nHorizon: ${HORIZON_DAYS} days. Day-by-day anomaly probability: ${out.day_probabilities.map((p) => Math.round(p * 100)).join(", ")}%.\nPeak probability: ${Math.round(out.max_probability * 100)}%. Model peak-severity index: ${out.peak_severity}.\nCause distribution (model softmax): ${probs}.\nEvidence from the input window: ${ev.join("; ")}.`;
  try {
    const r = await generateGeminiJson(prompt, ExplanationSchema);
    return { text: `${r.headline} — ${r.reasoning}`, via: "gemini-2.5-flash" };
  } catch {
    return fallback;
  }
}

const TTL_MS = 30 * 60 * 1000;
const gRef = globalThis as typeof globalThis & { __oceannovaOutlook?: { at: number; data: RegionOutlook[] } };

export async function getOutlooks(): Promise<RegionOutlook[]> {
  const cached = gRef.__oceannovaOutlook;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const regions = await getAllRegionSeries();
  const outlooks = await Promise.all(
    regions.map(async (region): Promise<RegionOutlook> => {
      const { window } = buildSeriesWindow(region.series, LOOKBACK_DAYS);
      const base: Omit<RegionOutlook, "risk" | "probability" | "peakDay" | "cause" | "causeProbabilities" | "peakSeverity" | "dayProbabilities" | "evidence" | "explanation" | "explanationSource" | "forecastModel" | "inferenceMs"> = {
        region: region.region,
        coordinates: region.coordinates,
        source: region.source,
        updatedAt: region.updatedAt,
        detail: region.detail,
        horizonLabel: `0–${HORIZON_DAYS * 24} h`,
      };
      const out = await forecastWindow(window);
      if (!out.ok) {
        return {
          ...base,
          risk: false,
          probability: 0,
          peakDay: 0,
          cause: "unknown_mixed",
          causeProbabilities: {},
          peakSeverity: 0,
          dayProbabilities: new Array(HORIZON_DAYS).fill(0),
          evidence: [`CNN engine unavailable (${out.error}); region listed without a model call.`],
          forecastModel: "unavailable",
          inferenceMs: 0,
        };
      }
      const evidence = evidenceStrings(region, out);
      const { text, via } = await explain(region.region, out, evidence);
      const peak = Math.max(...out.day_probabilities);
      return {
        ...base,
        risk: peak >= RISK_PROBABILITY_THRESHOLD,
        probability: Math.round(peak * 100),
        peakDay: out.day_probabilities.indexOf(peak) + 1,
        cause: out.primary_cause,
        causeProbabilities: out.cause_probabilities,
        peakSeverity: out.peak_severity,
        dayProbabilities: out.day_probabilities,
        evidence,
        explanation: text,
        explanationSource: via,
        forecastModel: out.model_version,
        inferenceMs: out.inference_ms,
      };
    }),
  );

  const sorted = outlooks.sort((a, b) => b.probability - a.probability);
  gRef.__oceannovaOutlook = { at: Date.now(), data: sorted };
  return sorted;
}
