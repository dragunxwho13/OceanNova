"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Activity, EyeOff, Waves, AlarmClock } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { CountUp } from "@/components/CountUp";
import { LineChart, Gauge } from "@/components/Charts";
import { WaveField } from "@/components/WaveField";
import { TEMP_SERIES } from "@/lib/mock";

const SALINITY = [35.1, 35.0, 34.9, 35.0, 34.8, 34.7, 34.8, 34.6, 34.5, 34.6, 34.4, 34.3];

const STATS = [
  {
    icon: Waves,
    value: 71,
    suffix: "%",
    prefix: "",
    title: "of Earth's surface remains undermonitored",
    body: "Vast stretches of open ocean have no persistent sensor coverage at all.",
  },
  {
    icon: EyeOff,
    value: 2000,
    suffix: "+",
    prefix: "",
    title: "anomalous events go undetected yearly",
    body: "Heat spikes, chemical plumes and current shears slip past legacy systems.",
  },
  {
    icon: AlarmClock,
    value: 5,
    suffix: "%",
    prefix: "< ",
    title: "of ocean data is analyzed in real-time",
    body: "Most telemetry is archived for weeks before a human ever sees it.",
  },
];

export function Problem() {
  const panelRef = useRef<HTMLDivElement>(null);

  // GSAP ScrollTrigger: parallax drift on the telemetry panel + scan bar
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".telemetry-panel",
        { y: 70, rotateX: 8 },
        {
          y: -30,
          rotateX: 0,
          ease: "none",
          scrollTrigger: { trigger: panelRef.current, start: "top bottom", end: "bottom top", scrub: 1.2 },
        }
      );
      gsap.fromTo(
        ".telemetry-glow",
        { opacity: 0.2 },
        {
          opacity: 0.7,
          ease: "none",
          scrollTrigger: { trigger: panelRef.current, start: "top 80%", end: "top 30%", scrub: true },
        }
      );
    }, panelRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="mission" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-plankton/10 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-24 h-80 w-80 rounded-full bg-bio-cyan/8 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 01 — The Mission
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            The Ocean Speaks.{" "}
            <span className="text-gradient">Are We Listening?</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* LEFT — telemetry data-viz panel */}
          <div ref={panelRef} style={{ perspective: 1100 }}>
            <div className="telemetry-panel glass relative rounded-3xl p-6 md:p-8 [transform-style:preserve-3d]">
              <div aria-hidden className="telemetry-glow absolute -inset-4 -z-10 rounded-[2rem] bg-bio-cyan/10 blur-2xl" />
              {/* scanline */}
              <div aria-hidden className="pointer-events-none absolute inset-x-6 h-px animate-scanline bg-gradient-to-r from-transparent via-bio-cyan/70 to-transparent" />

              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity className="h-4 w-4 text-bio-cyan" />
                  <span className="font-display text-sm font-semibold tracking-wide text-foam">
                    Live Telemetry — Buoy Array 7
                  </span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-bio-cyan/30 bg-bio-cyan/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-bio-cyan">
                  <span className="h-1.5 w-1.5 rounded-full bg-bio-cyan animate-blink" /> Streaming
                </span>
              </div>

              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-silver/60">
                  Sea Surface Temp Anomaly (°C)
                </p>
                <LineChart data={TEMP_SERIES} height={150} labels={["00:00", "06:00", "12:00", "18:00", "24:00"]} />
              </div>

              <div className="mt-6 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-silver/60">
                  Salinity (PSU)
                </p>
                <LineChart data={SALINITY} height={96} strokeFrom="#7B61FF" strokeTo="#00BBF9" showArea={false} labels={["W1", "W4", "W8", "W12"]} />
              </div>

              <div className="mt-8 flex items-end justify-around border-t border-white/5 pt-6">
                <Gauge value={0.82} label="Current drift" color="#00BBF9" />
                <Gauge value={0.44} label="Chem shift" color="#00F5D4" />
                <Gauge value={0.93} label="Heat flux" color="#FF6B6B" />
              </div>
            </div>
          </div>

          {/* RIGHT — stats */}
          <Stagger className="flex flex-col justify-center gap-5">
            {STATS.map((s) => (
              <StaggerItem key={s.title}>
                <div className="glass glass-hover group relative overflow-hidden rounded-2xl p-6">
                  {/* holographic edge */}
                  <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bio-cyan/70 to-transparent" />
                  <div aria-hidden className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-bio-cyan/10 blur-2xl transition-all duration-700 group-hover:bg-bio-cyan/20 group-hover:blur-3xl" />
                  <div className="flex items-start gap-5">
                    <div className="relative mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-bio-cyan/30 bg-abyssal-navy/60">
                      <s.icon className="h-5 w-5 text-bio-cyan" />
                      <span className="absolute inset-0 rounded-xl border border-bio-cyan/20 animate-ripple-ring" />
                    </div>
                    <div>
                      <p className="font-display text-3xl font-bold text-foam md:text-4xl">
                        <CountUp value={s.value} prefix={s.prefix} suffix={s.suffix} className="text-gradient" />
                      </p>
                      <p className="mt-1 font-display text-sm font-semibold text-silver">{s.title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-silver/65">{s.body}</p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
