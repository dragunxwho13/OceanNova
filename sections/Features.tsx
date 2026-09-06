"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Bell, BrainCircuit, History, Layers, Map, Radio } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const Globe = dynamic(() => import("@/three/Globe"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 shimmer rounded-full" />,
});

function CardShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      data-cursor="hover"
      data-active={active}
      aria-pressed={active}
      onClick={() => setActive((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActive((value) => !value);
        }
      }}
      className={`glass glass-hover group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl p-6 outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-bio-cyan/80 md:p-7 ${className}`}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bio-cyan/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-data-[active=true]:opacity-100" />
      {children}
      <span className="pointer-events-none absolute bottom-4 right-5 font-mono text-[9px] uppercase tracking-[0.2em] text-bio-cyan/0 transition-colors duration-300 group-hover:text-bio-cyan/60 group-data-[active=true]:text-bio-cyan/80">
        {active ? "Pinned" : "Inspect"}
      </span>
    </div>
  );
}

function CardHeader({ icon: Icon, title, color = "#1DA2D8" }: { icon: typeof Bell; title: string; color?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border bg-abyssal-navy/60" style={{ borderColor: `${color}44` }}>
        <Icon className="h-5 w-5 transition-transform duration-500 group-hover:scale-110" style={{ color }} />
      </span>
      <h3 className="font-display text-lg font-bold text-foam">{title}</h3>
    </div>
  );
}

/* Neural net micro-visual */
function NeuralViz() {
  const layers = [
    [20, 50, 80],
    [12, 42, 72, 102],
    [35, 65, 95],
  ];
  return (
    <svg viewBox="0 0 220 120" className="h-32 w-full">
      {layers[0].map((y0, i) =>
        layers[1].map(
          (y1, j) => (
            <line key={`a-${i}-${j}`} x1="24" y1={y0} x2="110" y2={y1} stroke="rgba(123,97,255,0.28)" strokeWidth="1">
              <animate attributeName="stroke-opacity" values="0.15;0.7;0.15" dur={`${2 + (i + j) * 0.35}s`} repeatCount="indefinite" />
            </line>
          )
        )
      )}
      {layers[1].map((y1, j) =>
        layers[2].map(
          (y2, k) => (
            <line key={`b-${j}-${k}`} x1="110" y1={y1} x2="196" y2={y2} stroke="rgba(0,245,212,0.26)" strokeWidth="1">
              <animate attributeName="stroke-opacity" values="0.12;0.8;0.12" dur={`${2.2 + (j + k) * 0.3}s`} repeatCount="indefinite" />
            </line>
          )
        )
      )}
      {layers[0].map((y, i) => (
        <circle key={`n0-${i}`} cx="24" cy={y} r="4.5" fill="#00BBF9" opacity="0.9">
          <animate attributeName="r" values="3.5;5.5;3.5" dur={`${1.8 + i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {layers[1].map((y, i) => (
        <circle key={`n1-${i}`} cx="110" cy={y} r="4.5" fill="#4E8FB5">
          <animate attributeName="r" values="3.2;5.8;3.2" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {layers[2].map((y, i) => (
        <circle key={`n2-${i}`} cx="196" cy={y} r="5" fill="#1DA2D8">
          <animate attributeName="r" values="4;6.5;4" dur={`${1.7 + i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;1;0.7" dur={`${1.7 + i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

/* Live pulse ECG line */
function PulseLine() {
  return (
    <div className="relative">
      <svg viewBox="0 0 300 60" className="h-16 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ecg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1DA2D8" stopOpacity="0" />
            <stop offset="50%" stopColor="#1DA2D8" />
            <stop offset="100%" stopColor="#00BBF9" />
          </linearGradient>
        </defs>
        <path
          d="M0 32 L40 32 L52 14 L64 48 L76 32 L124 32 L134 22 L144 42 L152 32 L202 32 L214 10 L226 52 L238 32 L300 32"
          fill="none"
          stroke="url(#ecg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="420"
          strokeDashoffset="420"
          style={{ filter: "drop-shadow(0 0 5px rgba(0,245,212,0.8))", animation: "ecg-run 3.4s linear infinite" }}
        />
        <style>{`@keyframes ecg-run { to { stroke-dashoffset: -420; } }`}</style>
      </svg>
      <div className="mt-3 flex items-center gap-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-bio-cyan animate-ping-soft" style={{ animationDelay: `${i * 0.7}s` }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bio-cyan" />
          </span>
        ))}
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-bio-cyan">148 buoys online</span>
      </div>
    </div>
  );
}

const PARAMS = [
  { label: "Temperature", v: 0.86, c: "#FF6B6B" },
  { label: "Salinity", v: 0.62, c: "#00BBF9" },
  { label: "pH", v: 0.48, c: "#1DA2D8" },
  { label: "Currents", v: 0.74, c: "#4E8FB5" },
];

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-45" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-electric-teal/8 blur-[130px]" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 03 — Capability
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            Powered by <span className="text-gradient">Innovation</span>
          </h2>
        </Reveal>

        <Stagger className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-12">
          {/* Interactive Data Maps — large globe card */}
          <StaggerItem className="md:col-span-7 md:row-span-2">
            <CardShell className="h-full min-h-[26rem]">
              <div className="absolute inset-0">
                <Globe />
              </div>
              <div className="pointer-events-none relative z-10 mt-auto pt-56 md:pt-64">
                <div className="pointer-events-auto">
                  <CardHeader icon={Map} title="Interactive Data Maps" color="#1DA2D8" />
                  <p className="max-w-md text-sm leading-relaxed text-silver/70">
                    Every flagged anomaly is plotted live onto a rotating ocean globe.
                    Rotate through basins is automatic — signal severity glows in
                    coral, solar and cyan.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Global grid", "10 active signals", "6 basins"].map((t) => (
                      <span key={t} className="rounded-full border border-bio-cyan/25 bg-abyssal-navy/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bio-cyan/90">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardShell>
          </StaggerItem>

          {/* Real-Time Monitoring */}
          <StaggerItem className="md:col-span-5">
            <CardShell className="h-full">
              <CardHeader icon={Activity} title="Real-Time Monitoring" color="#1DA2D8" />
              <p className="mb-4 text-sm leading-relaxed text-silver/70">
                A constant pulse of telemetry — streamed, timestamped and verified every second.
              </p>
              <PulseLine />
            </CardShell>
          </StaggerItem>

          {/* AI Anomaly Engine */}
          <StaggerItem className="md:col-span-5">
            <CardShell className="h-full">
              <CardHeader icon={BrainCircuit} title="AI Anomaly Engine" color="#4E8FB5" />
              <NeuralViz />
              <p className="text-sm leading-relaxed text-silver/70">
                A multi-layer network compares every reading against learned regional baselines.
              </p>
            </CardShell>
          </StaggerItem>

          {/* Multi-Parameter Analysis */}
          <StaggerItem className="md:col-span-4">
            <CardShell className="h-full">
              <CardHeader icon={Layers} title="Multi-Parameter Analysis" color="#00BBF9" />
              <div className="mt-1 space-y-3.5">
                {PARAMS.map((p, i) => (
                  <div key={p.label}>
                    <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-silver/70">
                      <span>{p.label}</span>
                      <span style={{ color: p.c }}>{Math.round(p.v * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: p.c, boxShadow: `0 0 10px ${p.c}` }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${p.v * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.4, delay: 0.2 + i * 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardShell>
          </StaggerItem>

          {/* Alert System */}
          <StaggerItem className="md:col-span-4">
            <CardShell className="h-full">
              <CardHeader icon={Bell} title="Alert System" color="#FF6B6B" />
              <div className="relative mt-1 space-y-2.5">
                {[
                  { t: "HIGH — Thermal spike", d: "N. Pacific Gyre", c: "#FF6B6B" },
                  { t: "MED — Salinity drop", d: "Bay of Bengal", c: "#FFC857" },
                ].map((a) => (
                  <div key={a.t} className="flex items-center gap-3 rounded-xl border border-white/5 bg-abyssal-navy/50 px-3.5 py-2.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute h-full w-full rounded-full animate-ping-soft" style={{ background: a.c }} />
                      <span className="relative h-2 w-2 rounded-full" style={{ background: a.c, boxShadow: `0 0 8px ${a.c}` }} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: a.c }}>{a.t}</p>
                      <p className="truncate text-[11px] text-silver/60">{a.d}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 text-silver/50">
                  <Radio className="h-3.5 w-3.5 text-bio-cyan" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Sub-second delivery</span>
                </div>
              </div>
            </CardShell>
          </StaggerItem>

          {/* Historical Comparison */}
          <StaggerItem className="md:col-span-4">
            <CardShell className="h-full">
              <CardHeader icon={History} title="Historical Comparison" color="#FFC857" />
              <svg viewBox="0 0 220 70" className="h-20 w-full" preserveAspectRatio="none">
                <path d="M0 50 C 30 44, 60 40, 110 38 C 160 36, 190 32, 220 30" fill="none" stroke="rgba(201,214,223,0.35)" strokeWidth="1.5" strokeDasharray="4 4" />
                <path d="M0 52 C 30 50, 60 42, 110 34 C 150 28, 190 24, 220 16" fill="none" stroke="#FFC857" strokeWidth="2" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,200,87,0.7))" }} />
                <line x1="0" y1="0" x2="0" y2="70" stroke="#1DA2D8" strokeWidth="1.5" style={{ animation: "scrub 5s ease-in-out infinite" }} />
                <style>{`@keyframes scrub { 0%,100%{ transform: translateX(12px);} 50%{ transform: translateX(204px);} }`}</style>
              </svg>
              <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-silver/55">
                <span>2015 baseline</span>
                <span className="text-solar">2026 live</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-silver/70">
                Scrub a decade of records against the live feed to see drift in seconds.
              </p>
            </CardShell>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}
