"use client";

import {
  Braces, BrainCircuit, Triangle, Box, Zap, Database, Wind, Sparkles, Container, FileCode2,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const STACK = [
  { icon: FileCode2, name: "Python", tip: "Model training & ETL", hue: "#FFC857" },
  { icon: BrainCircuit, name: "TensorFlow", tip: "Anomaly network core", hue: "#FF6B6B" },
  { icon: Zap, name: "FastAPI", tip: "Inference endpoints", hue: "#00F5D4" },
  { icon: Triangle, name: "Next.js", tip: "App shell & routing", hue: "#F0F7FF" },
  { icon: Box, name: "Three.js", tip: "WebGL ocean & globe", hue: "#00BBF9" },
  { icon: Database, name: "PostgreSQL", tip: "Anomaly records store", hue: "#7B61FF" },
  { icon: Wind, name: "Tailwind", tip: "Design system", hue: "#00E5CC" },
  { icon: Sparkles, name: "Framer Motion", tip: "Physics animations", hue: "#FFC857" },
  { icon: Braces, name: "TypeScript", tip: "Type-safe everything", hue: "#00BBF9" },
  { icon: Container, name: "Docker", tip: "Reproducible deploys", hue: "#00F5D4" },
];

export function TechStack() {
  return (
    <section id="stack" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-60" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-25" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-plankton/7 blur-[140px]" />

      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 06 — Arsenal <span className="inline-block h-px w-10 bg-bio-cyan/60" />
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section text-center text-foam">
            Built <span className="text-gradient">With</span>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-lg text-center text-base leading-relaxed text-silver/70">
            A stack chosen for speed at hackathon pace — and sturdiness for the
            open ocean after it.
          </p>
        </Reveal>

        <Stagger className="mt-16 flex flex-wrap items-center justify-center gap-5">
          {STACK.map((s, i) => (
            <StaggerItem key={s.name}>
              <div
                data-tip={s.tip}
                data-cursor="hover"
                className="bubble-tip glass glass-hover group flex w-32 flex-col items-center gap-3 rounded-2xl px-4 py-6 animate-float sm:w-36"
                style={{ animationDelay: `${(i % 5) * 0.7}s`, animationDuration: `${6 + (i % 4)}s` }}
              >
                <span
                  className="relative flex h-12 w-12 items-center justify-center rounded-xl border bg-abyssal-navy/60 transition-all duration-500 group-hover:scale-110"
                  style={{ borderColor: `${s.hue}44` }}
                >
                  <s.icon className="h-5.5 w-5.5 h-6 w-6 transition-colors" style={{ color: s.hue }} />
                  <span
                    className="absolute inset-0 rounded-xl opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: `${s.hue}30` }}
                  />
                </span>
                <span className="font-display text-sm font-semibold text-foam">{s.name}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
