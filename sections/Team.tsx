"use client";

import { Globe, AtSign, Mail, HeartHandshake } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/Reveal";
import { WaveField } from "@/components/WaveField";

const CREW = [
  {
    initials: "MV",
    name: "Dr. Marina Voss",
    role: "ML Lead · Ocean Modeler",
    line: "Trains networks to hear the ocean whisper before it screams.",
    bio: "Ex-WHOI researcher. Built anomaly models for the Argo float fleet and swears the Pacific has a personality.",
    hue: "#00F5D4",
  },
  {
    initials: "KA",
    name: "Kai Andersson",
    role: "Full-Stack Engineer",
    line: "Buoys in, alerts out — everything in between is his problem.",
    bio: "Real-time systems nerd. Once streamed 40k sensor events/sec through a Raspberry Pi, just to prove a point.",
    hue: "#00BBF9",
  },
  {
    initials: "PS",
    name: "Priya Sharma",
    role: "Data Pipeline Architect",
    line: "Keeps a billion data points flowing like a clean current.",
    bio: "Previously scaled satellite pipelines at ESA. Believes bad data is worse than no data — fiercely.",
    hue: "#7B61FF",
  },
  {
    initials: "LM",
    name: "Léo Moreau",
    role: "3D · Visualization Designer",
    line: "Turns raw telemetry into things people actually feel.",
    bio: "Former game-engine artist gone oceanographer. If it glows cyan in this app, he probably willed it into existence.",
    hue: "#FFC857",
  },
];

export function Team() {
  return (
    <section id="crew" className="relative overflow-hidden py-28 md:py-36">
      <WaveField className="opacity-50" />
      <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-bio-cyan/8 blur-[130px]" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <p className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.4em] text-bio-cyan">
            <span className="inline-block h-px w-10 bg-bio-cyan/60" /> 05 — The Crew
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="h-section max-w-3xl text-foam">
            The Crew Behind <span className="text-gradient">OCEANNOVA</span>
          </h2>
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
                    <p className="mt-3 text-sm italic leading-relaxed text-silver/70">“{m.line}”</p>
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
                      <p className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: m.hue }}>
                        Ship's log
                      </p>
                      <p className="mt-4 text-sm leading-relaxed text-silver">{m.bio}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-foam">{m.name.split(" ")[0]}</span>
                      <div className="flex gap-2">
                        {[Globe, AtSign, Mail].map((Icon, i) => (
                          <button
                            key={i}
                            aria-label={`${m.name} social link`}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-silver/70 transition hover:text-foam"
                            style={{ borderColor: `${m.hue}33` }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* About paragraph */}
        <Reveal delay={0.15}>
          <div className="glass relative mx-auto mt-14 max-w-3xl overflow-hidden rounded-3xl p-8 text-center md:p-10">
            <HeartHandshake className="mx-auto mb-4 h-6 w-6 text-bio-cyan" />
            <p className="text-base leading-relaxed text-silver/85 md:text-lg">
              OCEANNOVA was born in a 48-hour hackathon sprint, fueled by cold brew
              and a shared obsession: <span className="text-foam">the ocean generates
              planetary-scale data, but almost nobody is listening in real time.</span>{" "}
              We prototyped an end-to-end anomaly pipeline — from buoy to browser —
              to prove that a small crew can make the deep sea a little less silent.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
