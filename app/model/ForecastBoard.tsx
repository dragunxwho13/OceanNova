"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { BrainCircuit, Radio, RefreshCw, ShieldAlert, Waves } from "lucide-react";

type Outlook = {
  region: string;
  coordinates: [number, number];
  source: "live" | "cached" | "reference";
  updatedAt: string;
  detail: string;
  risk: boolean;
  probability: number;
  peakDay: number;
  horizonLabel: string;
  cause: string;
  causeProbabilities: Record<string, number>;
  peakSeverity: number;
  dayProbabilities: number[];
  evidence: string[];
  explanation?: string;
  explanationSource?: string;
  forecastModel: string;
  inferenceMs: number;
};

type ForecastPayload = {
  ok: boolean;
  model: string;
  engine: string;
  provenance?: string;
  updated_at: string;
  live_regions: number;
  horizon_days: number;
  outlooks: Outlook[];
  note?: string;
};

const CAUSE_COLORS: Record<string, string> = {
  harmful_algal_bloom: "#00F5D4",
  eutrophication: "#7ED957",
  oil_spill: "#FF8C42",
  sediment_plume: "#D4A373",
  coastal_runoff: "#7B61FF",
  thermal_anomaly: "#FF6B6B",
  unknown_mixed: "#8CA8B8",
  no_signal: "#4a6577",
};

const pretty = (s: string) => s.replaceAll("_", " ");

const SOURCE_BADGE: Record<Outlook["source"], { label: string; cls: string }> = {
  live: { label: "LIVE · NOAA CoastWatch PACE-era series", cls: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" },
  cached: { label: "CACHED · last good ERDDAP window", cls: "border-amber-300/40 bg-amber-300/10 text-amber-200" },
  reference: { label: "REFERENCE · model input while feeds are unreachable", cls: "border-white/20 bg-white/5 text-silver/70" },
};

function ProbabilityBar({ days, color }: { days: number[]; color: string }) {
  return (
    <div className="flex items-end gap-1" aria-label="Seven-day probability curve">
      {days.map((p, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-10 w-full items-end rounded-sm bg-white/[0.04]">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, p * 100)}%` }}
              transition={{ duration: 0.6, delay: i * 0.04 }}
              className="w-full rounded-sm"
              style={{ background: color, opacity: 0.35 + p * 0.65 }}
            />
          </div>
          <span className="font-mono text-[8px] text-white/35">d{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function OutlookCard({ o }: { o: Outlook }) {
  const color = CAUSE_COLORS[o.cause] ?? "#7fcdff";
  const badge = SOURCE_BADGE[o.source];
  return (
    <article className={`flex flex-col gap-4 rounded-2xl border p-5 ${o.risk ? "border-white/15 bg-[#0b2f4a]/85" : "border-white/8 bg-[#08243c]/70"}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-[#def3f6]">{o.region}</h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            {o.forecastModel === "unavailable" ? "engine offline" : `${o.forecastModel} · ${o.horizonLabel}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold tabular-nums" style={{ color: o.risk ? color : "rgba(255,255,255,0.5)" }}>
            {o.probability}%
          </p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/40">
            {o.peakDay > 0 ? `peak day ${o.peakDay}/7` : "no signal"}
          </p>
        </div>
      </header>

      <ProbabilityBar days={o.dayProbabilities} color={color} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: `${color}55`, color }}>
          {o.cause === "no_signal" ? "no elevated signal" : pretty(o.cause)}
        </span>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
        {o.explanationSource === "gemini-2.5-flash" && (
          <span className="flex items-center gap-1 rounded-full border border-sky-300/30 bg-sky-300/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-sky-200">
            <BrainCircuit className="h-3 w-3" /> Gemini 2.5 Flash
          </span>
        )}
      </div>

      {o.explanation && <p className="text-[12.5px] leading-5 text-white/65">{o.explanation}</p>}

      {o.evidence.length > 0 && (
        <ul className="space-y-1.5 border-t border-white/8 pt-3">
          {o.evidence.slice(0, 3).map((line, i) => (
            <li key={i} className="flex gap-2 font-mono text-[10px] leading-4 text-[#76b6c4]/80">
              <span className="text-white/25">›</span>
              {line}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function ForecastBoard() {
  const [showAll, setShowAll] = useState(false);
  const { data, mutate, isLoading } = useSWR<ForecastPayload>("oceannova-cnn-forecast", async (k: string) => {
    const res = await fetch(`/api/forecast`, { cache: "no-store" });
    if (!res.ok && res.status !== 503) throw new Error("forecast unavailable");
    return res.json();
  }, { refreshInterval: 10 * 60 * 1000 });

  const atRisk = useMemo(() => (data?.outlooks ?? []).filter((o) => o.risk), [data]);
  const visible = showAll ? [...(data?.outlooks ?? [])].sort((a, b) => b.probability - a.probability) : atRisk;

  return (
    <section id="forecast" className="mx-auto w-full max-w-[1600px] px-5 pb-16 pt-10 md:px-8">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#07223a]/90 to-[#04121f]/95 p-6 md:p-8 shadow-2xl shadow-black/30">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-bio-cyan/80">
              <Waves className="h-3.5 w-3.5" /> 02 · Predictive layer — ForecastCNN
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[#def3f6] md:text-3xl">
              What the ocean-color record says about the next seven days
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Each region&rsquo;s 14-day window of NOAA CoastWatch ocean-color, SST and turbidity daily values is scored by a
              convolutional network over time (14×7 → conv1d ×3 → heads). The bars are per-day anomaly probabilities;
              causes are the model&rsquo;s softmax, not ground truth. {data?.note && <span className="italic text-white/40">{data.note}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/55">
              <span className={`h-2 w-2 rounded-full ${data?.ok ? "bg-emerald-300" : "bg-amber-300"}`} />
              {data?.ok ? `engine online · ${data.live_regions}/${data.outlooks.length} regions live` : data ? "engine degraded" : "loading…"}
            </span>
            <button
              onClick={() => void mutate()}
              className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/55 transition hover:border-bio-cyan/60 hover:text-bio-cyan"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Recompute
            </button>
          </div>
        </header>

        {data && !data.ok && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 font-mono text-[11px] text-amber-100/90">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {`CNN weights not loaded (${data.engine}). Run \`pnpm train\` and commit ml/weights/. The board shows no model output until artifacts exist.`}
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.length === 0 && !isLoading && (
            <div className="col-span-full flex items-center gap-3 rounded-2xl border border-dashed border-white/15 p-6 font-mono text-xs text-white/45">
              <Radio className="h-4 w-4 text-emerald-300" />
              {showAll ? "No outlook data yet." : "No region crossed the 35% CNN risk threshold. Switch to all regions to see the quiet curves."}
            </div>
          )}
          {visible.map((o) => (
            <OutlookCard key={o.region} o={o} />
          ))}
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
          <button onClick={() => setShowAll((v) => !v)} className="font-mono text-[10px] uppercase tracking-widest text-[#7fcdff]/80 transition hover:text-[#7fcdff]">
            {showAll ? `Show at-risk only (${atRisk.length})` : `Show all ${data?.outlooks?.length ?? 0} regions`}
          </button>
          {data?.provenance && <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">trained: {new Date(data.updated_at).toUTCString()} · {data.provenance.slice(0, 120)}</p>}
        </footer>
      </div>
    </section>
  );
}
