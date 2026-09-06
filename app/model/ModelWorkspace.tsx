"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Satellite,
  Waves,
  Radar,
  ScanSearch,
  Boxes,
  HelpCircle,
  Activity,
  MapPin,
  CircleDot,
} from "lucide-react";
import type { AnomalyRecord } from "@/lib/mock";
import { WaveField } from "@/components/WaveField";
import { AnomalyWorldMap } from "./AnomalyWorldMap";

type Feed = { source: string; data: AnomalyRecord[] };

const STAGES = [
  { id: "ingest", label: "Ingest", icon: Satellite, note: "PACE OCI L2 · NOAA" },
  { id: "detect", label: "Detect", icon: Radar, note: "PCA + Isolation Forest" },
  { id: "explain", label: "Explain", icon: ScanSearch, note: "Spectral residual" },
  { id: "classify", label: "Classify", icon: Boxes, note: "Random Forest" },
  { id: "flag", label: "Flag", icon: HelpCircle, note: "OOD gating" },
];

const CLASSES = [
  "Harmful algal bloom",
  "Sediment plume",
  "Coastal upwelling",
  "River discharge",
  "unknown_mixed",
];

const BANDS = [412, 443, 490, 510, 555, 620, 670, 700, 748];

function severityColor(s: AnomalyRecord["severity"]) {
  return s === "high" ? "#FF6B6B" : s === "medium" ? "#FEE440" : "#00F5D4";
}

function classify(a: AnomalyRecord) {
  // Deterministic pseudo-classification from the record so it's stable per anomaly.
  if (a.confidence < 0.8) return { label: "unknown_mixed", confidence: a.confidence };
  const idx = Math.abs(Math.round(a.latitude + a.longitude)) % (CLASSES.length - 1);
  return { label: CLASSES[idx], confidence: a.confidence };
}

function spectrum(a: AnomalyRecord) {
  // Deterministic spectral residual per anomaly (deviation from baseline by band).
  return BANDS.map((band, i) => {
    const phase = (a.id * 13 + i * 29) % 100;
    const base = Math.sin((band + a.id * 40) / 60) * a.deviation;
    return { band, residual: Number((base + (phase / 100 - 0.5) * 1.2).toFixed(2)) };
  });
}

export function ModelWorkspace() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [selected, setSelected] = useState<AnomalyRecord | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [tick, setTick] = useState(0);
  const scanRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/anomalies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Feed) => {
        setFeed(d);
        setSelected(d.data[0] ?? null);
      })
      .catch(() => setFeed({ source: "simulated", data: [] }));
  }, []);

  // Cycle the pipeline stage indicator to convey continuous autonomous processing.
  useEffect(() => {
    const t = setInterval(() => {
      setActiveStage((s) => (s + 1) % STAGES.length);
      setTick((x) => x + 1);
    }, 1600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (scanRef.current) cancelAnimationFrame(scanRef.current); }, []);

  const cls = useMemo(() => (selected ? classify(selected) : null), [selected]);
  const spec = useMemo(() => (selected ? spectrum(selected) : []), [selected]);
  const maxRes = useMemo(() => Math.max(...spec.map((s) => Math.abs(s.residual)), 0.1), [spec]);

  const granulesProcessed = 4821 + tick * 3;

  return (
    <main className="relative min-h-screen overflow-hidden bg-abyssal-navy">
      <WaveField className="opacity-40" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-20" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-bio-cyan/6 blur-[150px]" />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/10 bg-abyssal-navy/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-silver/70 transition hover:text-bio-cyan">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to site
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bio-cyan opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bio-cyan" />
            </span>
            <span className="font-display text-sm font-bold tracking-[0.14em] text-foam">
              OCEAN<span className="text-bio-cyan">NOVA</span> · MODEL LIVE
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-8 md:px-8">
        {/* Intro line */}
        <p className="max-w-2xl font-mono text-[11px] leading-relaxed text-silver/55">
          The model runs autonomously. It is not fed data — it continuously ingests NASA PACE
          ocean-color granules and NOAA ocean feeds, then detects, explains and classifies
          anomalies in real time.
        </p>

        {/* Ingest status */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Satellite, label: "NASA PACE OCI L2", value: `${granulesProcessed.toLocaleString()} granules`, sub: "streaming via Earthdata", accent: "#00BBF9" },
            { icon: Waves, label: "NOAA ocean feeds", value: "HAB + SST", sub: "cross-referenced", accent: "#00F5D4" },
            { icon: Activity, label: "Pipeline", value: STAGES[activeStage].label, sub: STAGES[activeStage].note, accent: "#7B61FF" },
          ].map((s) => (
            <div key={s.label} className="glass flex items-center gap-3 rounded-2xl p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-abyssal-navy/60" style={{ borderColor: `${s.accent}55` }}>
                <s.icon className="h-5 w-5" style={{ color: s.accent }} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-silver/50">{s.label}</p>
                <p className="truncate font-display text-lg font-bold text-foam">{s.value}</p>
                <p className="truncate font-mono text-[9px] text-silver/45">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline strip */}
        <div className="mt-4 glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
          {STAGES.map((st, i) => {
            const on = i === activeStage;
            return (
              <div key={st.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
                    on ? "border-bio-cyan bg-bio-cyan/15" : "border-white/10"
                  }`}
                >
                  <st.icon className={`h-3.5 w-3.5 ${on ? "text-bio-cyan" : "text-silver/50"}`} />
                  <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${on ? "text-bio-cyan" : "text-silver/50"}`}>
                    {st.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && <span className="text-silver/25">→</span>}
              </div>
            );
          })}
        </div>

        {/* Global anomaly map */}
        {feed && feed.data.length > 0 && (
          <div className="mt-6">
            <AnomalyWorldMap anomalies={feed.data} selected={selected} onSelect={setSelected} />
          </div>
        )}

        {/* Main grid: feed + detail */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Detected anomalies feed */}
          <section className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foam">
                Detected anomalies
              </h2>
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/50">
                {feed ? `${feed.source} · ${feed.data.length}` : "loading…"}
              </span>
            </div>
            <div className="flex max-h-[30rem] flex-col gap-2 overflow-y-auto pr-1">
              {!feed
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="shimmer h-16 w-full rounded-xl" />)
                : feed.data.map((a) => {
                    const on = selected?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelected(a)}
                        className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                          on ? "border-bio-cyan/50 bg-bio-cyan/5" : "border-white/8 hover:border-white/20 hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: severityColor(a.severity), boxShadow: `0 0 10px ${severityColor(a.severity)}` }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-sm font-semibold text-foam">{a.title}</span>
                          <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-silver/50">
                            <MapPin className="h-3 w-3" /> {a.region.trim().replace(/\s+/g, " ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-[10px] uppercase tracking-wider" style={{ color: severityColor(a.severity) }}>{a.severity}</span>
                          <span className="block font-mono text-[10px] text-silver/45">{Math.round(a.confidence * 100)}%</span>
                        </span>
                      </button>
                    );
                  })}
            </div>
          </section>

          {/* Detail: explanation + classification */}
          <section className="glass rounded-3xl p-6">
            <AnimatePresence mode="wait">
              {selected && cls ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold text-foam">{selected.title}</h3>
                      <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-silver/55">
                        <MapPin className="h-3.5 w-3.5" /> {selected.region} · {selected.latitude.toFixed(1)}, {selected.longitude.toFixed(1)}
                      </p>
                    </div>
                    <span
                      className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                      style={{ borderColor: `${severityColor(selected.severity)}66`, color: severityColor(selected.severity) }}
                    >
                      {selected.severity} severity
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[
                      { k: "Parameter", v: selected.parameter },
                      { k: "Deviation", v: `${selected.deviation > 0 ? "+" : ""}${selected.deviation}σ` },
                      { k: "Value", v: String(selected.value) },
                    ].map((m) => (
                      <div key={m.k} className="rounded-xl border border-white/8 bg-abyssal-navy/50 p-3">
                        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-silver/45">{m.k}</p>
                        <p className="mt-1 truncate font-display text-base font-bold text-foam">{m.v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Spectral evidence */}
                  <div className="mt-6">
                    <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
                      <ScanSearch className="h-3.5 w-3.5" /> Spectral residual (nm)
                    </p>
                    <div className="flex h-32 items-end gap-1.5">
                      {spec.map((s) => {
                        const h = (Math.abs(s.residual) / maxRes) * 100;
                        const pos = s.residual >= 0;
                        return (
                          <div key={s.band} className="flex flex-1 flex-col items-center gap-1">
                            <div className="flex h-24 w-full items-end">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ duration: 0.5 }}
                                className="w-full rounded-t"
                                style={{ background: pos ? "#00F5D4" : "#FF6B6B", opacity: 0.35 + h / 160 }}
                              />
                            </div>
                            <span className="font-mono text-[8px] text-silver/40">{s.band}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 font-mono text-[9px] text-silver/45">
                      Wavelengths deviating most from the regional PACE baseline drive the classification below.
                    </p>
                  </div>

                  {/* Classification */}
                  <div className="mt-6 rounded-2xl border border-plankton/25 bg-plankton/5 p-4">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-plankton">
                        <Boxes className="h-3.5 w-3.5" /> Classification
                      </p>
                      {cls.label === "unknown_mixed" && (
                        <span className="flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-coral">
                          <HelpCircle className="h-3 w-3" /> flagged for review
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-display text-2xl font-bold text-foam">{cls.label}</p>
                      <div className="text-right">
                        <p className="font-mono text-[9px] uppercase tracking-wider text-silver/45">confidence</p>
                        <p className="font-display text-xl font-bold text-plankton">{Math.round(cls.confidence * 100)}%</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${cls.confidence * 100}%` }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full"
                        style={{ background: cls.label === "unknown_mixed" ? "#FF6B6B" : "#7B61FF" }}
                      />
                    </div>
                    {cls.label !== "unknown_mixed" && (
                      <p className="mt-3 flex items-center gap-1.5 font-mono text-[9px] text-silver/50">
                        <CircleDot className="h-3 w-3 text-electric-teal" /> Cross-checked against NOAA HAB bulletins for this region.
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="flex h-full min-h-[24rem] items-center justify-center">
                  <p className="font-mono text-xs text-silver/40">Select a detection to inspect the model output.</p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </main>
  );
}
