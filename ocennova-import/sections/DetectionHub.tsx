"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UploadCloud, FileText, FlaskConical, Thermometer, Droplets, Wind,
  Activity, SwitchCamera, MapPin, ShieldAlert, Construction, Waves,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { RippleButton } from "@/components/RippleButton";
import { LineChart, Sparkline, Heatmap, MiniMap, type MapPin as MapPinType } from "@/components/Charts";
import { useToast } from "@/components/Toast";
import { WaveField } from "@/components/WaveField";
import { FALLBACK_ANOMALIES, TEMP_SERIES, HEATMAP_SEED, type AnomalyRecord } from "@/lib/mock";

type View = "idle" | "uploading" | "construction" | "sample-loading" | "sample";

const SEV = {
  low: { color: "#1DA2D8", label: "LOW", bg: "rgba(0,245,212,0.10)" },
  medium: { color: "#FFC857", label: "MEDIUM", bg: "rgba(255,200,87,0.10)" },
  high: { color: "#FF6B6B", label: "HIGH", bg: "rgba(255,107,107,0.10)" },
} as const;

/* ── Animated submarine (analysis engine under construction) ── */
function Submarine() {
  return (
    <div className="relative mx-auto h-36 w-72 animate-sub-drift">
      {/* periscope */}
      <div className="absolute left-[44%] top-0 h-8 w-2.5 rounded-t-full bg-gradient-to-b from-electric-teal to-deep-ocean" />
      <div className="absolute left-[44%] top-0 h-2.5 w-6 rounded-t-full bg-electric-teal/80" />
      {/* sail */}
      <div className="absolute left-[38%] top-6 h-8 w-16 rounded-t-[20px] bg-gradient-to-b from-abyss-2 to-deep-ocean border border-electric-teal/20" />
      {/* hull */}
      <div className="absolute left-1/2 top-[52px] h-16 w-64 -translate-x-1/2 rounded-[60px] border border-electric-teal/25 bg-gradient-to-b from-abyss-2 via-deep-ocean to-abyssal-navy shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8),inset_0_2px_6px_rgba(240,247,255,0.08)]">
        {/* portholes */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-electric-teal/40 bg-abyssal-navy"
            style={{ left: `${18 + i * 18}%`, boxShadow: "inset 0 0 8px rgba(0,245,212,0.5)" }}
          >
            <span className="absolute inset-1 rounded-full bg-bio-cyan/25" />
          </span>
        ))}
        {/* nose beacon */}
        <span className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-coral shadow-[0_0_12px_rgba(255,107,107,0.9)] animate-blink" />
      </div>
      {/* tail + propeller */}
      <div className="absolute right-[6px] top-[62px] h-9 w-5 rounded-r-xl bg-gradient-to-r from-deep-ocean to-abyss-2 border-y border-r border-electric-teal/20" />
      <div className="absolute -right-[10px] top-[63px] animate-prop" style={{ transformOrigin: "center" }}>
        <div className="relative h-8 w-2">
          <span className="absolute left-1/2 top-0 h-3.5 w-1.5 -translate-x-1/2 rounded-full bg-electric-teal/70" />
          <span className="absolute bottom-0 left-1/2 h-3.5 w-1.5 -translate-x-1/2 rounded-full bg-electric-teal/70" />
        </div>
      </div>
      {/* bubbles */}
      {[...Array(6)].map((_, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full border border-bio-cyan/50 bg-bio-cyan/10 animate-rise"
          style={{
            left: `${52 + i * 7}%`,
            width: `${4 + (i % 3) * 3}px`,
            height: `${4 + (i % 3) * 3}px`,
            animationDuration: `${3.5 + (i % 3)}s`,
            animationDelay: `${i * 0.55}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Jellyfish loading indicator ── */
function JellyLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative animate-jelly">
        <div className="h-16 w-20 rounded-t-full border border-plankton/50 bg-gradient-to-b from-plankton/40 to-electric-teal/20 shadow-[0_0_36px_rgba(123,97,255,0.4)]" />
        <div className="flex justify-center gap-2 px-2">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className="h-8 w-[3px] rounded-b-full bg-gradient-to-b from-plankton/70 to-transparent animate-bob"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-bio-cyan animate-blink">{label}</p>
    </div>
  );
}

/* ── Live readings hook ── */
type Reading = { label: string; unit: string; value: number; history: number[]; color: string; icon: typeof Wind };

function useLiveFeed(active: boolean) {
  const [readings, setReadings] = useState<Reading[]>([
    { label: "SST", unit: "°C", value: 18.4, history: [18.1, 18.2, 18.4], color: "#FF6B6B", icon: Thermometer },
    { label: "Salinity", unit: "PSU", value: 34.9, history: [35.0, 34.9, 34.9], color: "#7FCDFF", icon: Droplets },
    { label: "pH", unit: "", value: 8.05, history: [8.06, 8.05, 8.05], color: "#1DA2D8", icon: FlaskConical },
    { label: "Current", unit: "m/s", value: 0.82, history: [0.8, 0.81, 0.82], color: "#7B61FF", icon: Wind },
  ]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setReadings((rs) =>
        rs.map((r) => {
          const amp = r.label === "pH" ? 0.02 : r.label === "Current" ? 0.06 : 0.12;
          const next = Math.max(0, r.value + (Math.random() - 0.5) * amp * 2);
          return { ...r, value: next, history: [...r.history.slice(-31), next] };
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return { readings, tick };
}

/* ════════════════════  MAIN HUB  ════════════════════ */
export function DetectionHub() {
  const { push } = useToast();
  const [view, setView] = useState<View>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [live, setLive] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [dataSource, setDataSource] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const { readings } = useLiveFeed(live);

  const startUpload = useCallback(
    (name: string) => {
      setFileName(name);
      setView("uploading");
      setProgress(0);
      push("Dataset received", `${name} queued for deep analysis.`, "success");
      const started = performance.now();
      const id = setInterval(() => {
        const p = Math.min(100, ((performance.now() - started) / 2100) * 100);
        setProgress(Math.round(p));
        if (p >= 100) {
          clearInterval(id);
          setTimeout(() => setView("construction"), 350);
        }
      }, 50);
    },
    [push]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      startUpload(f ? f.name : "ocean_dataset.nc");
    },
    [startUpload]
  );

  const loadSample = async () => {
    setView("sample-loading");
    let list: AnomalyRecord[] = FALLBACK_ANOMALIES;
    let source = "simulated";
    try {
      const res = await fetch("/api/anomalies", { cache: "no-store" });
      const json = (await res.json()) as { source: string; data: AnomalyRecord[] };
      if (Array.isArray(json.data) && json.data.length > 0) {
        list = json.data;
        source = json.source;
      }
    } catch {
      /* fallback stays */
    }
    setTimeout(() => {
      setAnomalies(list);
      setDataSource(source);
      setView("sample");
      push(
        "Sample analysis complete",
        `${list.length} anomalies flagged — source: ${source === "database" ? "PostgreSQL feed" : "simulated feed"}.`,
        "success"
      );
    }, 1500);
  };

  const pins: MapPinType[] = anomalies.map((a) => ({
    id: a.id,
    lat: a.latitude,
    lng: a.longitude,
    severity: a.severity,
    label: `${a.title} — ${a.region}`,
  }));

  return (
    <section id="hub" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[46rem] -translate-x-1/2 rounded-full bg-bio-cyan/6 blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 04 — Application
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section flex flex-wrap items-center gap-4 text-foam">
            Detection Hub
            <span className="rounded-full border border-solar/50 bg-solar/10 px-3.5 py-1.5 font-mono text-xs font-bold tracking-[0.25em] text-solar shadow-[0_0_20px_-4px_rgba(255,200,87,0.6)]">
              BETA
            </span>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-silver/70">
            Upload your own ocean dataset, explore a full sample analysis, or tune
            into the simulated live feed. All anomaly records below are served from
            our PostgreSQL pipeline.
          </p>
        </Reveal>

        {/* ── Dashboard shell ── */}
        <Reveal delay={0.2}>
          <div className="glass relative mt-12 overflow-hidden rounded-3xl">
            {/* window chrome */}
            <div className="flex items-center justify-between border-b border-white/5 bg-abyssal-navy/60 px-5 py-3.5 md:px-7">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-coral/80" />
                <span className="h-3 w-3 rounded-full bg-solar/80" />
                <span className="h-3 w-3 rounded-full bg-bio-cyan/80" />
              </div>
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/60">
                <Waves className="h-3.5 w-3.5 text-bio-cyan" /> oceannova://detection-hub
              </span>
              <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${live ? "text-bio-cyan" : "text-silver/40"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-bio-cyan animate-blink" : "bg-silver/40"}`} />
                {live ? "Live" : "Standby"}
              </span>
            </div>

            <div className="grid gap-6 p-5 md:p-7 lg:grid-cols-5">
              {/* ══ LEFT: upload + controls ══ */}
              <div className="space-y-5 lg:col-span-2">
                {/* Upload zone */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload ocean dataset"
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className={`group relative flex min-h-[13rem] flex-col items-center justify-center gap-3 rounded-2xl bg-abyssal-navy/50 p-6 text-center transition-all duration-300 ${
                    dragging ? "scale-[1.02] bg-bio-cyan/5" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {/* animated dashed wave border */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                    <rect
                      x="1.5" y="1.5" rx="16"
                      width="calc(100% - 3px)" height="calc(100% - 3px)"
                      fill="none"
                      stroke={dragging ? "#1DA2D8" : "rgba(0,245,212,0.35)"}
                      strokeWidth="1.5"
                      strokeDasharray="10 6"
                      strokeLinecap="round"
                      className="animate-dash-march"
                    />
                  </svg>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.json,.nc,.netcdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) startUpload(f.name);
                      e.target.value = "";
                    }}
                  />
                  <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-500 ${dragging ? "border-bio-cyan bg-bio-cyan/15" : "border-bio-cyan/30 bg-deep-ocean/60 group-hover:border-bio-cyan/70"}`}>
                    <UploadCloud className={`h-6 w-6 text-bio-cyan transition-transform duration-500 ${dragging ? "-translate-y-1 scale-110" : "group-hover:-translate-y-1"}`} />
                  </span>
                  <p className="font-display text-base font-semibold text-foam">
                    {dragging ? "Release to submerge" : "Drop your ocean dataset here"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-silver/50">
                    CSV · JSON · NetCDF — max 500 MB
                  </p>
                </div>

                {/* Sample data button */}
                <RippleButton variant="ghost" className="w-full" onClick={loadSample}>
                  <FlaskConical className="h-4.5 w-4.5 h-5 w-5" />
                  Try with Sample Data
                </RippleButton>

                {/* Live feed toggle */}
                <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-abyssal-navy/50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <SwitchCamera className="h-5 w-5 text-electric-teal" />
                    <div>
                      <p className="font-display text-sm font-semibold text-foam">View Live Ocean Feed</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-silver/50">Simulated stream · 1 Hz</p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={live}
                    aria-label="Toggle live ocean feed"
                    onClick={() => {
                      setLive((l) => !l);
                      push(
                        live ? "Live feed paused" : "Live feed connected",
                        live ? "Telemetry stream on standby." : "Streaming buoy telemetry at 1 Hz.",
                        live ? "info" : "success"
                      );
                    }}
                    className={`relative h-7 w-13 w-12 rounded-full border transition-colors duration-300 ${live ? "border-bio-cyan bg-bio-cyan/25 shadow-[0_0_16px_rgba(0,245,212,0.4)]" : "border-silver/25 bg-white/5"}`}
                  >
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full ${live ? "right-1 bg-bio-cyan shadow-[0_0_10px_rgba(0,245,212,0.9)]" : "left-1 bg-silver/70"}`}
                    />
                  </button>
                </div>

                {/* Live readouts */}
                <div className="grid grid-cols-2 gap-3">
                  {readings.map((r) => (
                    <div key={r.label} className={`rounded-xl border p-3.5 transition-colors duration-500 ${live ? "border-bio-cyan/20 bg-deep-ocean/50" : "border-white/5 bg-abyssal-navy/40 opacity-60"}`}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-silver/60">
                          <r.icon className="h-3 w-3" style={{ color: r.color }} /> {r.label}
                        </span>
                      </div>
                      <p className="font-display text-xl font-bold tabular-nums text-foam">
                        {r.value.toFixed(r.label === "pH" ? 2 : 1)}
                        <span className="ml-1 font-mono text-[10px] font-normal text-silver/50">{r.unit}</span>
                      </p>
                      <div className="mt-1.5">
                        <Sparkline data={r.history} color={r.color} height={26} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ══ RIGHT: state views ══ */}
              <div className="relative min-h-[34rem] rounded-2xl border border-white/5 bg-abyssal-navy/40 p-5 md:p-6 lg:col-span-3">
                <AnimatePresence mode="wait">
                  {/* IDLE */}
                  {view === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -14 }}
                      className="flex h-full min-h-[30rem] flex-col items-center justify-center text-center"
                    >
                      <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
                        <span className="absolute inset-0 rounded-full border border-bio-cyan/30 animate-sonar" />
                        <span className="absolute inset-0 rounded-full border border-electric-teal/20 animate-sonar" style={{ animationDelay: "0.9s" }} />
                        <span className="absolute inset-0 rounded-full border border-plankton/20 animate-sonar" style={{ animationDelay: "1.8s" }} />
                        <Activity className="h-9 w-9 text-bio-cyan" />
                      </div>
                      <h3 className="font-display text-2xl font-bold text-foam">Awaiting Signal</h3>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-silver/60">
                        Upload a dataset or run the sample analysis to see the
                        anomaly engine come alive.
                      </p>
                    </motion.div>
                  )}

                  {/* UPLOADING */}
                  {view === "uploading" && (
                    <motion.div
                      key="uploading"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
                      className="flex h-full min-h-[30rem] flex-col items-center justify-center"
                    >
                      <FileText className="mb-5 h-10 w-10 text-bio-cyan animate-bob" />
                      <p className="font-mono text-sm text-foam">{fileName}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-silver/50">
                        Submerging dataset… {progress}%
                      </p>
                      {/* wave fill progress */}
                      <div className="relative mt-7 h-4 w-72 max-w-full overflow-hidden rounded-full border border-bio-cyan/25 bg-deep-ocean/70">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-bio-cyan/70 via-electric-teal/70 to-plankton/70 transition-[width] duration-100"
                          style={{ width: `${progress}%` }}
                        />
                        <svg className="absolute inset-x-0 top-0 h-full w-[200%] animate-wave-x opacity-70" viewBox="0 0 200 10" preserveAspectRatio="none">
                          <path d="M0 5 Q 6 1 12 5 T 24 5 T 36 5 T 48 5 T 60 5 T 72 5 T 84 5 T 96 5 T 108 5 T 120 5 T 132 5 T 144 5 T 156 5 T 168 5 T 180 5 T 192 5 T 204 5" fill="none" stroke="rgba(240,247,255,0.55)" strokeWidth="0.8" />
                        </svg>
                      </div>
                    </motion.div>
                  )}

                  {/* UNDER CONSTRUCTION */}
                  {view === "construction" && (
                    <motion.div
                      key="construction"
                      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -14 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      className="flex h-full min-h-[30rem] flex-col items-center justify-center overflow-hidden text-center"
                    >
                      <Submarine />
                      <div className="mt-8 flex items-center gap-2.5 rounded-full border border-solar/40 bg-solar/10 px-4 py-1.5">
                        <Construction className="h-4 w-4 text-solar" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-solar">
                          Analysis Engine Under Construction
                        </span>
                      </div>
                      <p className="mt-4 max-w-md text-sm leading-relaxed text-silver/70">
                        Our backend is still being trained on ocean datasets.
                        The research sub is fitting the sonar array as we speak —
                        check back soon!
                      </p>
                      <RippleButton variant="ghost" className="mt-6" onClick={loadSample}>
                        <FlaskConical className="h-4.5 w-4.5 h-5 w-5" />
                        Meanwhile — run the sample analysis
                      </RippleButton>
                    </motion.div>
                  )}

                  {/* SAMPLE LOADING */}
                  {view === "sample-loading" && (
                    <motion.div
                      key="sample-loading"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -14 }}
                      className="flex h-full min-h-[30rem] flex-col items-center justify-center"
                    >
                      <JellyLoader label="Scanning 24h of telemetry…" />
                    </motion.div>
                  )}

                  {/* SAMPLE DASHBOARD */}
                  {view === "sample" && (
                    <motion.div
                      key="sample"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -14 }}
                      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                      className="space-y-6"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="h-5 w-5 text-coral" />
                          <h3 className="font-display text-lg font-bold text-foam">
                            Sample Analysis — Buoy Array 7
                          </h3>
                        </div>
                        <span className="rounded-full border border-electric-teal/30 bg-electric-teal/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-electric-teal">
                          Source: {dataSource === "database" ? "PostgreSQL" : "Simulated"}
                        </span>
                      </div>

                      <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/55">
                          Temperature anomaly — last 24 h (σ deviation)
                        </p>
                        <LineChart data={TEMP_SERIES} height={170} labels={["00:00", "06:00", "12:00", "18:00", "24:00"]} />
                      </div>

                      <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/55">
                          Regional anomaly heatmap — Pacific sector
                        </p>
                        <Heatmap seed={HEATMAP_SEED} />
                      </div>

                      <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/55">
                          Geospatial distribution
                        </p>
                        <MiniMap pins={pins} />
                      </div>

                      <div>
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-silver/55">
                          Detected anomalies ({anomalies.length})
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {anomalies.slice(0, 6).map((a, i) => {
                            const s = SEV[a.severity] ?? SEV.medium;
                            return (
                              <motion.div
                                key={a.id}
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 + i * 0.09, duration: 0.5 }}
                                className="rounded-xl border border-white/5 bg-deep-ocean/50 p-4 transition-colors duration-300 hover:border-bio-cyan/30"
                              >
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {a.severity === "high" && <span className="relative flex h-2 w-2"><span className="absolute h-full w-full rounded-full bg-coral animate-ping-soft" /><span className="relative h-2 w-2 rounded-full bg-coral" /></span>}
                                    <p className="font-display text-sm font-semibold leading-tight text-foam">{a.title}</p>
                                  </div>
                                  <span
                                    className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.15em]"
                                    style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}55` }}
                                  >
                                    {s.label}
                                  </span>
                                </div>
                                <p className="flex items-center gap-1.5 font-mono text-[10px] text-silver/60">
                                  <MapPin className="h-3 w-3 text-electric-teal" /> {a.region.trim()} · {a.latitude.toFixed(1)}°, {a.longitude.toFixed(1)}°
                                </p>
                                <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-silver/60">
                                  <span>{a.parameter}</span>
                                  <span style={{ color: s.color }}>
                                    {a.deviation > 0 ? "+" : ""}{a.deviation.toFixed(1)}σ
                                  </span>
                                </div>
                                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                                  <motion.div
                                    className="h-full rounded-full"
                                    style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${a.confidence * 100}%` }}
                                    transition={{ delay: 0.7 + i * 0.09, duration: 1 }}
                                  />
                                </div>
                                <p className="mt-1.5 text-right font-mono text-[9px] text-silver/45">
                                  {(a.confidence * 100).toFixed(0)}% confidence
                                </p>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* idle scanline flavor */}
                {view === "idle" && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-6 h-px animate-scanline bg-gradient-to-r from-transparent via-electric-teal/50 to-transparent" />
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
