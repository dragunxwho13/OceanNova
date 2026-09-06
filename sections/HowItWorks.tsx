"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Satellite, BrainCircuit, Radar, BellRing, ArrowDown } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const STEPS = [
  {
    icon: Satellite,
    step: "01",
    title: "Data Ingestion",
    body: "We pull real-time telemetry from satellites, drifting buoys and fixed sensor arrays across every ocean basin.",
    accent: "#00BBF9",
    chip: "INGEST",
  },
  {
    icon: BrainCircuit,
    step: "02",
    title: "AI Analysis",
    body: "Neural models scan multi-parameter streams, learning each region's natural rhythm and seasonal baseline.",
    accent: "#7B61FF",
    chip: "ANALYZE",
  },
  {
    icon: Radar,
    step: "03",
    title: "Anomaly Detection",
    body: "Temperature spikes, unusual currents and chemical shifts get flagged the moment they deviate from baseline.",
    accent: "#00F5D4",
    chip: "DETECT",
  },
  {
    icon: BellRing,
    step: "04",
    title: "Actionable Alerts",
    body: "Severity-scored alerts reach researchers and agencies in seconds — not weeks — with full context attached.",
    accent: "#FF6B6B",
    chip: "ALERT",
  },
];

export function HowItWorks() {
  const wrapRef = useRef<HTMLDivElement>(null);

  // GSAP ScrollTrigger draws the data-pipeline line as you scroll
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const line = wrapRef.current?.querySelector<SVGPathElement>(".pipeline-line");
      if (line) {
        const len = line.getTotalLength();
        gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(line, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: wrapRef.current,
            start: "top 72%",
            end: "bottom 55%",
            scrub: 1,
          },
        });
      }
      gsap.fromTo(
        ".pipeline-packet",
        { offsetDistance: "0%" },
        {
          offsetDistance: "100%",
          ease: "none",
          scrollTrigger: { trigger: wrapRef.current, start: "top 72%", end: "bottom 55%", scrub: 1 },
        }
      );
    }, wrapRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="pipeline" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-60" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 02 — The Pipeline
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            From Raw Data to <span className="text-gradient">Real Insights</span>
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-silver/70">
            Four stages, one continuous flow. Watch a packet of sensor data travel
            from the ocean floor to a researcher's inbox.
          </p>
        </Reveal>

        <div ref={wrapRef} className="relative mt-16">
          {/* flowing connector (desktop) */}
          <svg
            aria-hidden
            className="absolute left-0 top-1/2 hidden h-24 w-full -translate-y-1/2 lg:block"
            viewBox="0 0 1200 96"
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d="M40 48 C 240 10, 360 86, 600 48 C 840 10, 960 86, 1160 48"
              stroke="rgba(0,245,212,0.12)"
              strokeWidth="2"
              strokeDasharray="6 8"
              className="animate-flow"
            />
            <path
              className="pipeline-line"
              d="M40 48 C 240 10, 360 86, 600 48 C 840 10, 960 86, 1160 48"
              stroke="url(#pipeGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 6px rgba(0,245,212,0.7))" }}
            />
            <defs>
              <linearGradient id="pipeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00BBF9" />
                <stop offset="50%" stopColor="#00F5D4" />
                <stop offset="100%" stopColor="#FF6B6B" />
              </linearGradient>
            </defs>
          </svg>
          {/* packet dot riding the line */}
          <div
            aria-hidden
            className="pipeline-packet absolute left-0 top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full bg-foam shadow-[0_0_16px_rgba(240,247,255,0.9)] lg:block"
            style={{
              offsetPath: "path('M40 48 C 240 10, 360 86, 600 48 C 840 10, 960 86, 1160 48')",
              transform: "scale(1.1)",
            }}
          />
          {/* vertical connector (mobile) */}
          <div aria-hidden className="absolute bottom-6 left-[27px] top-6 w-px bg-gradient-to-b from-electric-teal/50 via-bio-cyan/50 to-coral/50 lg:hidden" />

          <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <StaggerItem key={s.step}>
                <div className="glass glass-hover group relative h-full overflow-hidden rounded-2xl p-6">
                  <div
                    aria-hidden
                    className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-50"
                    style={{ background: s.accent }}
                  />
                  <div className="mb-5 flex items-center justify-between">
                    <div
                      className="relative flex h-14 w-14 items-center justify-center rounded-2xl border bg-abyssal-navy/70"
                      style={{ borderColor: `${s.accent}55` }}
                    >
                      <s.icon className="h-6 w-6 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" style={{ color: s.accent }} />
                      <span className="absolute inset-0 rounded-2xl border opacity-0 animate-ripple-ring group-hover:opacity-100" style={{ borderColor: `${s.accent}66` }} />
                    </div>
                    <span className="font-mono text-3xl font-bold text-white/8" style={{ color: "rgba(240,247,255,0.07)" }}>
                      {s.step}
                    </span>
                  </div>
                  <span
                    className="mb-3 inline-block rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.25em]"
                    style={{ borderColor: `${s.accent}44`, color: s.accent }}
                  >
                    {s.chip}
                  </span>
                  <h3 className="font-display text-xl font-bold text-foam">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-silver/70">{s.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <Reveal delay={0.15} className="mt-12 flex justify-center">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-silver/50">
            <ArrowDown className="h-3.5 w-3.5 text-bio-cyan" />
            Fully automated in under 90 seconds
          </span>
        </Reveal>
      </div>
    </section>
  );
}
