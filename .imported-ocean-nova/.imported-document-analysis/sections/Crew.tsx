"use client";

import { Code2, Server, Layers, Waves } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const CREW = [
  {
    initials: "T",
    name: "Tejas",
    role: "Frontend & Backend",
    line: "Wires the whole vessel together, deck to engine room.",
    bio: "Owns the app end to end — from the pixel-perfect UI down to the APIs that keep the anomaly feed alive.",
    hue: "#00F5D4",
    Icon: Layers,
  },
  {
    initials: "S",
    name: "Sarfaraz",
    role: "Frontend",
    line: "Makes every screen feel like it's breathing with the tide.",
    bio: "Crafts the interfaces and motion you actually see — obsessed with getting every animation to feel alive.",
    hue: "#00BBF9",
    Icon: Code2,
  },
  {
    initials: "A",
    name: "Aniket",
    role: "Core Backend",
    line: "Keeps the deep systems running quietly underneath it all.",
    bio: "Architects the core services and data pipelines that everything else on this ship depends on.",
    hue: "#7B61FF",
    Icon: Server,
  },
  {
    initials: "H",
    name: "Hriday",
    role: "Frontend & Backend",
    line: "Dives wherever the current needs an extra hand.",
    bio: "Full-stack all-rounder — jumps between UI polish and backend plumbing to keep the crew moving fast.",
    hue: "#FFC857",
    Icon: Waves,
  },
];

export function Crew() {
  return (
    <section id="crew" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-50" />
      <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-bio-cyan/8 blur-[130px]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-plankton/8 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> The Crew
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            The Crew Behind <span className="text-gradient">OCEANNOVA</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-silver/70 md:text-lg">
            Four hands on deck, one mission — turning a wall of ocean telemetry
            into something a human can actually understand in real time.
          </p>
        </Reveal>

        <Stagger className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CREW.map((m) => (
            <StaggerItem key={m.name}>
              <div className="group h-[21rem] [perspective:1200px]" data-cursor="hover">
                <div className="relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
                  {/* FRONT */}
                  <div className="glass absolute inset-0 flex flex-col items-center justify-center rounded-3xl p-6 text-center [backface-visibility:hidden]">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bio-cyan/40 to-transparent" />
                    {/* porthole avatar */}
                    <div className="relative mb-5">
                      <span
                        className="absolute -inset-2 rounded-full border-2 opacity-50 transition-all duration-500 group-hover:scale-110 group-hover:opacity-90"
                        style={{ borderColor: m.hue, boxShadow: `0 0 24px ${m.hue}44` }}
                      />
                      <span className="absolute -inset-2 rounded-full border border-dashed border-white/10 animate-spin-slower" />
                      <div
                        className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 font-display text-2xl font-bold text-foam"
                        style={{
                          background: `radial-gradient(circle at 32% 28%, ${m.hue}55, #0D2137 70%)`,
                          boxShadow: `inset 0 4px 14px rgba(240,247,255,0.12), inset 0 -8px 18px rgba(10,22,40,0.8)`,
                        }}
                      >
                        {m.initials}
                        {/* rivets */}
                        {[0, 90, 180, 270].map((deg) => (
                          <span
                            key={deg}
                            className="absolute h-1.5 w-1.5 rounded-full bg-silver/50"
                            style={{
                              transform: `rotate(${deg}deg) translateY(-46px)`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <h3 className="font-display text-lg font-bold text-foam">{m.name}</h3>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: m.hue }}>
                      {m.role}
                    </p>
                    <p className="mt-3 text-sm italic leading-relaxed text-silver/70">&ldquo;{m.line}&rdquo;</p>
                  </div>

                  {/* BACK */}
                  <div
                    className="absolute inset-0 flex flex-col justify-between rounded-3xl border p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    style={{
                      background: `linear-gradient(160deg, ${m.hue}18, #0D2137 45%, #0A1628)`,
                      borderColor: `${m.hue}55`,
                      boxShadow: `0 0 40px -12px ${m.hue}66`,
                    }}
                  >
                    <div>
                      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: m.hue }}>
                        <m.Icon className="h-3.5 w-3.5" /> Contribution
                      </p>
                      <p className="mt-4 text-sm leading-relaxed text-silver">{m.bio}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-foam">{m.name}</span>
                      <span
                        className="rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em]"
                        style={{ borderColor: `${m.hue}55`, color: m.hue }}
                      >
                        {m.role}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
