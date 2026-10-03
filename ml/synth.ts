/**
 * Physically-motivated ocean-optics generator for training the OCEANNOVA CNNs.
 *
 * Spectral part: 32-band water-leaving reflectance built from analytic band
 * shapes (Rayleigh-dominated blue peak, chlorophyll absorption at 440/670 nm,
 * the 709 nm fluorescence bump, CDOM suppression below 470 nm, suspended-
 * sediment scatter rising through the red) — the same mechanisms PACE OCI
 * measures at coarser fidelity. Event classes modulate those components with
 * plausible magnitudes; noise is multiplicative + additive sensor noise.
 *
 * Time-series part: daily regional drivers (chlorophyll, SST, Kd490, sea
 * state) with seasonality and AR(1) memory; anomaly events evolve with lead
 * signals BEFORE onset so the forecaster has real precursor structure to
 * learn — blooms ramp for days before exceeding the detection z-threshold,
 * sediment plumes are wind-driven and decay fast, thermal events are slow.
 *
 * This generator is honest about being synthetic; `pnpm train --source erddap`
 * swaps it for real CoastWatch PACE/MODIS series (forecast net) while keeping
 * the spectral trunk on curated physical samples, exactly as the README
 * describes for weak-label training.
 */

import { BAND_GRID_NM, CAUSES, HORIZON_DAYS, LOOKBACK_DAYS, type Cause } from "../lib/ml/constants";
import { snv, type DailySample } from "../lib/ml/features";

/* ───────────────────────────── seeded RNG ───────────────────────────── */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const gauss = (r: Rng) => {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* ─────────────────────────── spectral samples ─────────────────────────── */

const band = (wl: number, center: number, width: number) => Math.exp(-((wl - center) ** 2) / (2 * width * width));

/**
 * Raw linear reflectance per canonical band for a given geophysical state.
 * amplitudes: chlor [mg/m3], sed [g/m3], cdom [m-1 @440], slick [-].
 */
export function spectrumFor(chl: number, sed: number, cdom: number, slick: number, rng: Rng): number[] {
  return BAND_GRID_NM.map((wl) => {
    // molecular water-leaving blue peak
    let r = 0.0045 * Math.exp(-(wl - 410) / 60);
    // clean-water minimum in the red absorption band
    r += 0.0006;
    // phytoplankton: blue absorption shoulder + green bump + red fluorescence
    r += chl * (0.0016 * band(wl, 560, 30) + 0.010 * band(wl, 682, 9) - 0.0022 * band(wl, 443, 25));
    // suspended sediment scatter rising toward red
    r += sed * (0.004 * band(wl, 620, 80) + 0.0022 * band(wl, 560, 60));
    // CDOM absorbs blue-violet
    r -= cdom * 0.0035 * Math.exp(-(wl - 380) / 55);
    // oil slick: global darkening PLUS a real shape signature that survives SNV —
    // PAH absorption in the violet/blue and petroleum fluorescence around 480 nm,
    // with suppressed 680 fluorescence (living matter gone under the film).
    r *= 1 - 0.45 * slick;
    r -= slick * 0.0075 * band(wl, 435, 55);
    r += slick * 0.0048 * band(wl, 480, 32);
    r -= slick * 0.004 * chl * band(wl, 682, 9);
    // multiplicative + additive noise
    r = Math.max(1e-5, r * (1 + gauss(rng) * 0.05) + gauss(rng) * 2e-5);
    return r;
  });
}

export type SpectralSample = {
  features: number[]; // SNV log10 grid — direct CNN input
  anomaly: number; // 0/1
  cause: number; // index into CAUSES (-1 for normal)
};

type EventRecipe = { chl: [number, number]; sed: [number, number]; cdom: [number, number]; slick: [number, number] };

const RECIPES: Record<string, EventRecipe> = {
  normal: { chl: [0.03, 0.25], sed: [0.0, 0.4], cdom: [0.0, 0.25], slick: [0, 0] },
  harmful_algal_bloom: { chl: [2.5, 12], sed: [0.0, 0.8], cdom: [0.2, 0.9], slick: [0, 0] },
  oil_spill: { chl: [0.03, 0.3], sed: [0.0, 0.25], cdom: [0.0, 0.15], slick: [0.4, 1.0] },
  eutrophication: { chl: [1.2, 5], sed: [0.6, 2.2], cdom: [0.4, 1.2], slick: [0, 0.05] },
  sediment_plume: { chl: [0.05, 0.6], sed: [2.5, 9], cdom: [0.1, 0.8], slick: [0, 0] },
  coastal_runoff: { chl: [0.4, 2.0], sed: [1.2, 4], cdom: [0.8, 1.8], slick: [0, 0] },
  thermal_anomaly: { chl: [0.15, 0.9], sed: [0.0, 0.5], cdom: [0.0, 0.4], slick: [0, 0.08] },
};

const uniform = (r: Rng, [lo, hi]: [number, number]) => lo + r() * (hi - lo);

export function makeSpectralSet(n: number, seed = 7): { xs: number[][]; anomaly: number[]; cause: number[] } {
  const rng = mulberry32(seed);
  const xs: number[][] = [];
  const anomaly: number[] = [];
  const cause: number[] = [];
  const classes: (Cause | "normal")[] = [...CAUSES.filter((c) => c !== "unknown_mixed"), "normal", "unknown_mixed"];
  for (let i = 0; i < n; i++) {
    const label = classes[Math.floor(rng() * classes.length)];
    const recipe = RECIPES[label] ?? RECIPES.normal;
    let raw = spectrumFor(
      uniform(rng, recipe.chl),
      uniform(rng, recipe.sed),
      uniform(rng, recipe.cdom),
      uniform(rng, recipe.slick),
      rng,
    );
    if (label === "unknown_mixed") {
      // Genuine out-of-distribution: clean water plus one-to-three strong, randomly
      // placed spectral excursions that match NO known cause signature. The network
      // learns "not one of the six", which is exactly what the OOD gate needs.
      const nBumps = 1 + Math.floor(rng() * 3);
      for (let b = 0; b < nBumps; b++) {
        const center = 420 + rng() * 430;
        const width = 18 + rng() * 70;
        const amp = (0.004 + rng() * 0.03) * (rng() < 0.25 ? -1 : 1);
        raw = raw.map((v, wlIdx) => v + amp * Math.exp(-((BAND_GRID_NM[wlIdx] - center) ** 2) / (2 * width * width)));
      }
    }
    if (label === "normal" && rng() < 0.3) {
      // heavy-noise normals keep false-positive rates honest against sensor noise
      raw = raw.map((v) => Math.max(1e-5, v * (1 + gauss(rng) * 0.18)));
    }
    raw = raw.map((v) => Math.max(v, 1e-5));
    const logRaw = raw.map((v) => Math.log10(Math.max(v, 1e-6)));
    const meanLin = raw.reduce((a, b) => a + b, 0) / raw.length;
    const energy = (Math.log10(Math.max(meanLin, 1e-7)) + 4) / 0.5;
    xs.push([...snv(logRaw), Math.max(-5, Math.min(9, energy))]);
    anomaly.push(label === "normal" ? 0 : 1);
    cause.push(label === "normal" ? -1 : CAUSES.indexOf(label as Cause));
  }
  return { xs, anomaly, cause };
}

/* ───────────────────────── time-series samples (forecast) ───────────────────────── */

const Z_EVENT = 2.2; // z-score at/above which a day counts as anomalous (labeling rule)

type TsEvent = { kind: Exclude<Cause, "unknown_mixed">; onset: number; duration: number; peak: number };

type Driver = { base: number; amp: number; noise: number; phi: number };
const CHL: Driver = { base: 0.4, amp: 0.45, noise: 0.16, phi: 0.72 };
const SST: Driver = { base: 20, amp: 5, noise: 0.5, phi: 0.85 };
const KD: Driver = { base: 0.08, amp: 0.09, noise: 0.12, phi: 0.6 };

function ar1(n: number, rng: Rng, phi: number, noise: number): number[] {
  const out: number[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    x = phi * x + gauss(rng) * noise;
    out.push(x);
  }
  return out;
}

/** One region: 28 days of drivers + injected events; yields training windows. */
function makeRegionDays(rng: Rng, doy0: number): { days: DailySample[]; zChl: number[]; zSst: number[]; events: TsEvent[] } {
  const N = LOOKBACK_DAYS + HORIZON_DAYS + 7;
  const chlA = ar1(N, rng, CHL.phi, CHL.noise);
  const sstA = ar1(N, rng, SST.phi, SST.noise);
  const kdA = ar1(N, rng, KD.phi, KD.noise);
  const wind = ar1(N, rng, 0.4, 4).map((v) => Math.max(0, 7 + v));
  const wave = wind.map((w) => Math.max(0.2, w * 0.18 + gauss(rng) * 0.4));

  // inject 0-2 events at plausible positions
  const events: TsEvent[] = [];
  const nEvents = rng() < 0.45 ? (rng() < 0.7 ? 1 : 2) : 0;
  const kinds: TsEvent["kind"][] = ["harmful_algal_bloom", "oil_spill", "eutrophication", "sediment_plume", "coastal_runoff", "thermal_anomaly"];
  for (let i = 0; i < nEvents; i++) {
    events.push({
      kind: kinds[Math.floor(rng() * kinds.length)],
      onset: 5 + Math.floor(rng() * (N - 12)),
      duration: 4 + Math.floor(rng() * 7),
      peak: 2.6 + rng() * 3.4,
    });
  }

  const days: DailySample[] = [];
  const zChl: number[] = [];
  const zSst: number[] = [];
  for (let t = 0; t < N; t++) {
    const doy = (doy0 + t) % 365;
    const season = Math.sin((2 * Math.PI * (doy - 60)) / 365.25);
    let chl = CHL.base * (1 + CHL.amp * season + chlA[t]);
    let sst = SST.base + SST.amp * season + sstA[t];
    let kd = KD.base * (1 + KD.amp * season * 2 + kdA[t] * 3);
    let cdomBoost = 0;
    for (const ev of events) {
      const p = (t - (ev.onset - 4)) / (ev.duration + 4); // 4-day precursor ramp
      if (p < 0 || p > 1) {
        // precursor: weak lead signal for blooms/runoff (nutrient stirring)
        if (p < 0 && p > -0.25 && (ev.kind === "harmful_algal_bloom" || ev.kind === "eutrophication")) {
          chl *= 1 + 0.18 * ev.peak * 0.15;
          sst += 0.25;
        }
        continue;
      }
      const hump = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) ** 1.5;
      const g = hump * ev.peak;
      switch (ev.kind) {
        case "harmful_algal_bloom":
          chl += g * 0.45;
          kd += g * 0.012;
          cdomBoost += g * 0.3;
          break;
        case "eutrophication":
          chl += g * 0.3;
          kd += g * 0.02;
          break;
        case "oil_spill":
          chl -= g * 0.06;
          kd += g * 0.018;
          break;
        case "sediment_plume":
          kd += g * 0.05;
          chl += g * 0.04;
          break;
        case "coastal_runoff":
          kd += g * 0.03;
          chl += g * 0.12;
          cdomBoost += g * 0.5;
          break;
        case "thermal_anomaly":
          sst += g * 1.1;
          break;
      }
    }
    // approximate the feature z-scores the runtime will compute (window-relative)
    const meanChl = CHL.base;
    zChl.push((chl - meanChl) / (meanChl * 0.5));
    zSst.push((sst - SST.base) / 1.4);
    days.push({
      date: `2026-01-01`, // dates only feed doy encoding; offset below
      chlor_a: Math.max(0.01, chl),
      sst_c: sst,
      kd490: Math.max(0.005, kd * (1 + cdomBoost * 0.4)),
      wind_ms: wind[t],
      wave_m: wave[t],
    });
    (days[days.length - 1] as { date: string }).date = new Date(Date.UTC(2026, 0, 1 + doy0 + t)).toISOString().slice(0, 10);
  }
  return { days, zChl, zSst, events };
}

function stats(a: number[]): { mean: number; std: number } {
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const std = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length) || 1e-6;
  return { mean, std };
}

/**
 * Training windows for ForecastCNN. Feature construction mirrors the runtime
 * (rolling z from the first 7 days of the window + normalized sea state +
 * doy encoding) so train/serve feature spaces match exactly.
 * Labels: per-horizon-day anomaly indicator from the window-relative z-scores,
 * cause from the injected event, peak severity from max z.
/**
 * Training windows for ForecastCNN. Feature construction mirrors the runtime
 * exactly (rolling z from the window's first 7 days + normalized sea state +
 * doy encoding) so train/serve feature spaces match.
 * Labels: per-horizon-day anomaly indicator from window-relative z-scores,
 * cause from the injected event covering the future window, severity from max z.
 */
export function makeForecastSet(n: number, seed = 21): { xs: number[][][]; dayY: number[][]; causeY: number[]; severityY: number[] } {
  const rng = mulberry32(seed);
  const xs: number[][][] = [];
  const dayY: number[][] = [];
  const causeY: number[] = [];
  const severityY: number[] = [];
  let guard = 0;
  while (xs.length < n && guard++ < n * 40) {
    const { days, zChl, zSst, events } = makeRegionDays(rng, Math.floor(rng() * 365));
    for (let start = 7; start + LOOKBACK_DAYS + HORIZON_DAYS <= days.length && xs.length < n; start++) {
      if (rng() > 0.35) continue; // thin, like real sparse event coverage
      const win = days.slice(start, start + LOOKBACK_DAYS);
      const zc = zChl.slice(start, start + LOOKBACK_DAYS);
      const zs = zSst.slice(start, start + LOOKBACK_DAYS);
      const sc = stats(zc.slice(0, 7));
      const ss = stats(zs.slice(0, 7));
      const base = stats(days.slice(0, 7).map((d) => d.kd490 ?? 0));
      const x: number[][] = win.map((d, i) => {
        const doy = (new Date(d.date).getTime() - Date.UTC(2026, 0, 0)) / 86_400_000;
        const kdV = d.kd490 ?? 0;
        return [
          (zc[i] - sc.mean) / sc.std,
          (zs[i] - ss.mean) / ss.std,
          (kdV - base.mean) / (base.std || 1e-6),
          Math.min(1, (d.wind_ms ?? 0) / 25),
          Math.min(1, (d.wave_m ?? 0) / 12),
          Math.sin((2 * Math.PI * doy) / 365.25),
          Math.cos((2 * Math.PI * doy) / 365.25),
        ];
      });
      const futZ = zChl.slice(start + LOOKBACK_DAYS, start + LOOKBACK_DAYS + HORIZON_DAYS);
      const labels = futZ.map((z) => (Math.abs((z - sc.mean) / sc.std) >= Z_EVENT ? 1 : 0));
      while (labels.length < HORIZON_DAYS) labels.push(0);
      const futureIdx = start + LOOKBACK_DAYS;
      let cause = -1;
      for (const ev of events) {
        const evStart = ev.onset - 4;
        const evEnd = ev.onset + ev.duration;
        if (evStart <= futureIdx && evEnd >= futureIdx) cause = CAUSES.indexOf(ev.kind as Cause);
      }
      const anyRisk = labels.some((l) => l === 1);
      if (anyRisk && cause === -1) cause = CAUSES.indexOf("unknown_mixed");
      xs.push(x);
      dayY.push(labels);
      causeY.push(cause);
      severityY.push(anyRisk ? Math.min(1, Math.max(...futZ.map((z) => Math.abs((z - sc.mean) / sc.std))) / 6) : 0.05);
    }
  }
  return { xs, dayY, causeY, severityY };
}
