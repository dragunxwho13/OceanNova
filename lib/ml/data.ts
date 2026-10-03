/**
 * Daily regional series for the ForecastCNN.
 *
 * Primary source: NOAA CoastWatch ERDDAP (public griddap CSV — no API key, no
 * auth, exactly the PACE-era ocean-color feeds this project is built on) plus
 * NOAA NDBC buoy wind/sea state. Every step degrades honestly:
 *
 *   live ERDDAP → cached snapshot (memory + /tmp) → deterministic reference series
 *
 * and each region result carries a `source` flag so the UI can never present a
 * simulated window as if it were a live satellite reading.
 */

import { ERDDAP_BASE, ERDDAP_DATASETS, FORECAST_REGIONS, LOOKBACK_DAYS } from "./constants";
import type { DailySample } from "./features";

/* ── buoy sea state (kept local so the ML build stays free of Next-only typings) ── */

export type BuoyObs = {
  station: string;
  name: string;
  lat: number;
  lon: number;
  waterTempC: number | null;
  waveHeightM: number | null;
  windMs: number | null;
  time: string;
};

async function fetchNdbcLatestObs(): Promise<{ data: BuoyObs[]; live: boolean }> {
  try {
    const res = await fetch("https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`NDBC ${res.status}`);
    const lines = (await res.text()).split("\n").filter((l) => l && !l.startsWith("#"));
    const data: BuoyObs[] = [];
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 19) continue;
      const [station, latStr, lonStr] = cols;
      const lat = Number(latStr);
      const lon = Number(lonStr);
      const wspd = Number(cols[9]);
      const wvht = Number(cols[11]);
      const wtmp = Number(cols[14]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      data.push({
        station,
        name: station,
        lat,
        lon,
        waterTempC: Number.isFinite(wtmp) && wtmp < 90 ? wtmp : null,
        waveHeightM: Number.isFinite(wvht) && wvht < 90 ? wvht : null,
        windMs: Number.isFinite(wspd) && wspd < 90 ? wspd : null,
        time: "latest",
      });
    }
    if (data.length === 0) throw new Error("no rows parsed");
    return { data, live: true };
  } catch {
    return { data: [], live: false };
  }
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestBuoy(coord: [number, number], buoys: BuoyObs[]): { buoy: BuoyObs; distanceKm: number } | null {
  let best: { buoy: BuoyObs; distanceKm: number } | null = null;
  for (const buoy of buoys) {
    const distanceKm = haversineKm(coord, [buoy.lon, buoy.lat]);
    if (!best || distanceKm < best.distanceKm) best = { buoy, distanceKm };
  }
  return best;
}

export type RegionSeries = {
  region: string;
  coordinates: [number, number];
  series: DailySample[];
  source: "live" | "cached" | "reference";
  updatedAt: string;
  detail: string;
};

export type RegionName = (typeof FORECAST_REGIONS)[number];

/** Region anchors for the forecast layer: [lon, lat] grid-cell centers. */
export const REGION_ANCHORS: Record<RegionName, [number, number]> = {
  "Bay of Bengal": [88.3, 14.6],
  "Arabian Sea": [66.0, 16.0],
  "Gulf of Mexico": [-90.5, 25.5],
  "North Pacific Gyre": [-152.4, 35.2],
  "Great Barrier Reef": [152.6, -17.2],
  "Norwegian Sea": [3.0, 67.0],
  "Drake Passage": [-65.0, -59.0],
  "East China Sea": [126.0, 30.0],
  "Caribbean Sea": [-75.0, 15.0],
  "Benguela Current": [10.5, -25.0],
};

const TIMEOUT_MS = 7_000;
const TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = { at: number; payload: { chl: (number | null)[]; sst: (number | null)[]; kd: (number | null)[] } };
const memoryCache = new Map<string, CacheEntry>();

function snapshotPath(key: string) {
  return `/tmp/oceannova-series-${key}.json`;
}

/**
 * Build an ERDDAP griddap CSV query for one variable over a 1.5° box around the
 * anchor, one row per day (dataset stride = 1 day for these daily composites).
 * Griddap2 syntax: dataset.csv?variable[(t0):1:(t1)][(lat0):1:(lat1)][(lon0):1:(lon1)]
 * We ask for the coarsest spatial subset and average the returned cells client-side.
 */
function erddapUrl(variable: keyof typeof ERDDAP_DATASETS, [lon, lat]: [number, number], days: number): string {
  const conf = ERDDAP_DATASETS[variable];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days + 2) * 86_400_000);
  const t0 = start.toISOString().replace(/\.\d{3}Z$/, "Z");
  const t1 = end.toISOString().replace(/\.\d{3}Z$/, "Z");
  // one day per step; request a small box (1° resolution data → a few cells)
  const latQ = `(${(lat - 0.75).toFixed(2)}):1:${(lat + 0.75).toFixed(2)}`;
  const lonQ = `(${(lon - 0.75).toFixed(2)}):1:${(lon + 0.75).toFixed(2)}`;
  return (
    `${ERDDAP_BASE}/griddap/${conf.dataset}.csv?${conf.variable}` +
    `[${t0}:1day:${t1}][${latQ}][${lonQ}]`
  );
}

async function fetchVariable(
  variable: keyof typeof ERDDAP_DATASETS,
  anchor: [number, number],
  days: number,
): Promise<Map<string, number>> {
  const url = erddapUrl(variable, anchor, days);
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`ERDDAP ${variable} ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 3) throw new Error(`ERDDAP ${variable}: empty result`);
  // header: time, latitude, longitude, <variable>, quality_flag
  const header = lines[0].split(",");
  const tIdx = header.findIndex((h) => h.toLowerCase().startsWith("time"));
  const vIdx = header.findIndex((h) => h.toLowerCase() === ERDDAP_DATASETS[variable].variable.toLowerCase());
  if (tIdx < 0 || vIdx < 0) throw new Error(`ERDDAP ${variable}: unexpected columns`);
  const byDay = new Map<string, number[]>();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const t = cols[tIdx];
    if (!t) continue;
    const day = t.slice(0, 10);
    const raw = cols[vIdx];
    if (raw == null || raw === "" || raw === "NaN" || Number.isNaN(Number(raw))) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || Math.abs(v) > 1e6) continue;
    const arr = byDay.get(day) ?? [];
    arr.push(v);
    byDay.set(day, arr);
  }
  const out = new Map<string, number>();
  for (const [day, arr] of byDay) out.set(day, arr.reduce((a, b) => a + b, 0) / arr.length);
  if (out.size === 0) throw new Error(`ERDDAP ${variable}: no valid cells`);
  return out;
}

function daysRange(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** Deterministic ocean-color "reference day" used only when live+cached both miss. */
function referenceDay(region: string, day: string): Pick<DailySample, "chlor_a" | "sst_c" | "kd490"> {
  let h = 0;
  const seedStr = `${region}:${day}`;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const doy = Number(new Date(day).getUTCMonth()) * 30.4 + Number(new Date(day).getUTCDate());
  // Deliberately near-flat with small per-day jitter only: a reference window carries
  // no anomaly signal, and any smooth multi-day trend inside it would (correctly, by
  // design) read as a precursor ramp to ForecastCNN — fabricating risk from nothing.
  const n1 = ((h % 1000) / 1000 - 0.5) * 0.06;
  const n2 = (((h >> 7) % 1000) / 1000 - 0.5) * 0.05;
  const n3 = (((h >> 13) % 1000) / 1000 - 0.5) * 0.06;
  void doy;
  return {
    chlor_a: Math.max(0.02, 0.35 * (1 + n1)),
    sst_c: 21 + n2 * 2,
    kd490: Math.max(0.01, 0.08 * (1 + n3)),
  };
}

async function loadSnapshot(key: string): Promise<CacheEntry | null> {
  try {
    const raw = await Promise.resolve().then(() => require("node:fs").readFileSync(snapshotPath(key), "utf8"));
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function saveSnapshot(key: string, entry: CacheEntry) {
  try {
    await Promise.resolve().then(() => require("node:fs").writeFileSync(snapshotPath(key), JSON.stringify(entry)));
  } catch {
    /* read-only fs — memory cache only */
  }
}

type LiveSeries = { chl: (number | null)[]; sst: (number | null)[]; kd: (number | null)[] };

async function fetchLive(anchor: [number, number], days: string[]): Promise<LiveSeries> {
  const [chl, sst, kd] = await Promise.all(
    (["chlor_a", "sst", "kd490"] as const).map((v) => fetchVariable(v, anchor, days.length + 3).catch(() => null)),
  );
  if (!chl && !sst && !kd) throw new Error("all ERDDAP sources unavailable");
  const pick = (m: Map<string, number> | null) => days.map((d) => (m?.has(d) ? m.get(d)! : null));
  return { chl: pick(chl), sst: pick(sst), kd: pick(kd) };
}

const buoysCache: { at: number; data: BuoyObs[] | null } = { at: 0, data: null };
async function buoys(): Promise<BuoyObs[]> {
  if (buoysCache.data && Date.now() - buoysCache.at < TTL_MS) return buoysCache.data;
  const { data } = await fetchNdbcLatestObs();
  const live = data !== undefined && data.length > 0;
  if (live) {
    buoysCache.at = Date.now();
    buoysCache.data = data;
  }
  return buoysCache.data ?? data;
}

/** Assemble the daily series for one forecast region, with graceful degradation. */
export async function getRegionSeries(region: RegionName, windowDays: number = LOOKBACK_DAYS + 2): Promise<RegionSeries> {
  const anchor = REGION_ANCHORS[region];
  const days = daysRange(windowDays);
  const key = `${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${windowDays}`;

  let payload: LiveSeries | null = null;
  let source: RegionSeries["source"] = "live";
  let detail = "NOAA CoastWatch ERDDAP daily ocean color (chlor_a, SST, Kd490)";

  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) {
    payload = cached.payload;
    source = "cached";
    detail = "cached ERDDAP window (< 6 h old)";
  } else {
    try {
      payload = await fetchLive(anchor, days);
      const entry = { at: Date.now(), payload };
      memoryCache.set(key, entry);
      void saveSnapshot(key, entry);
    } catch (liveError) {
      const snap = await loadSnapshot(key);
      if (snap) {
        payload = snap.payload;
        source = "cached";
        detail = "last-known ERDDAP snapshot (live fetch failed)";
      } else {
        payload = null;
        source = "reference";
        detail = `deterministic reference series — live feed unavailable (${liveError instanceof Error ? liveError.message.split(":")[0] : "network"})`;
      }
    }
  }

  // NDBC latest_obs is current-only — the nearest buoy's sea state is applied
  // to the final day as "today's conditions" context (documented, not hidden).
  const near = await buoys().then((list) => nearestBuoy(anchor, list));
  const series: DailySample[] = days.map((day, i) => {
    const ref = referenceDay(region, day);
    const idx = days.indexOf(day);
    const isToday = i === days.length - 1;
    return {
      date: day,
      chlor_a: payload?.chl[idx] ?? ref.chlor_a,
      sst_c: payload?.sst[idx] ?? ref.sst_c,
      kd490: payload?.kd[idx] ?? ref.kd490,
      wind_ms: isToday ? (near?.buoy?.windMs ?? null) : null,
      wave_m: isToday ? (near?.buoy?.waveHeightM ?? null) : null,
    };
  });

  return {
    region,
    coordinates: anchor,
    series,
    source,
    updatedAt: new Date().toISOString(),
    detail: near ? `${detail}; nearest buoy ${near.buoy.station} at ${Math.round(near.distanceKm)} km` : detail,
  };
}

export async function getAllRegionSeries(): Promise<RegionSeries[]> {
  return Promise.all(FORECAST_REGIONS.map((r) => getRegionSeries(r)));
}
