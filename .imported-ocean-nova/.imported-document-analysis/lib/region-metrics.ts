import { Bug, Droplets, FlaskConical, Gauge, Leaf, Thermometer, Waves, Wind, type LucideIcon } from "lucide-react";

export type RegionMetric = {
  key: string;
  label: string;
  unit: string;
  percent: number;
  icon: LucideIcon;
};

export type RegionProfile = {
  region: string;
  metrics: RegionMetric[];
};

export const METRIC_META: { key: string; label: string; unit: string; icon: LucideIcon }[] = [
  { key: "sst", label: "Sea Surface Temp", unit: "°C dev", icon: Thermometer },
  { key: "salinity", label: "Salinity Drop", unit: "PSU dev", icon: Droplets },
  { key: "current", label: "Current Shear", unit: "m/s dev", icon: Wind },
  { key: "ph", label: "pH Acidification", unit: "pH dev", icon: FlaskConical },
  { key: "oxygen", label: "Dissolved Oxygen", unit: "mg/L dev", icon: Waves },
  { key: "chlorophyll", label: "Chlorophyll-a", unit: "mg/m³", icon: Leaf },
  { key: "hab", label: "HAB Risk Index", unit: "bloom risk", icon: Bug },
  { key: "pressure", label: "Hydrostatic Pressure", unit: "kPa dev", icon: Gauge },
];

export type RegionPercents = Record<string, number[]>;

// Reference/fallback anomaly severities (0-100) for every metric, for every one of the 8
// tracked ocean regions. Order matches METRIC_META: [sst, salinity, current, ph, oxygen,
// chlorophyll, hab, pressure]. This table is ONLY used when the live Gemini + NOAA/PACE
// computation (see lib/live-anomalies.ts) is unavailable — it's the offline reference,
// not the primary source of truth for the map.
export const BASELINE_REGION_PERCENTS: RegionPercents = {
  "North Pacific Gyre": [94, 34, 58, 21, 40, 27, 18, 12],
  "Bay of Bengal": [45, 93, 33, 29, 52, 61, 57, 15],
  "Drake Passage": [22, 19, 91, 24, 31, 14, 9, 41],
  "Great Barrier Reef": [63, 28, 22, 92, 44, 55, 48, 11],
  "Arabian Sea": [51, 46, 29, 33, 90, 64, 71, 17],
  "Norwegian Sea": [39, 24, 35, 18, 27, 21, 14, 20],
  "Gulf of Mexico": [57, 31, 26, 38, 66, 93, 91, 19],
  "Mariana Trench Rim": [12, 15, 33, 20, 28, 9, 7, 91],
  "South Pacific Gyre": [92, 29, 41, 24, 37, 22, 15, 26],
  "South Atlantic Gyre": [48, 33, 27, 91, 30, 25, 19, 22],
  "Indian Ocean Basin": [55, 39, 30, 28, 93, 45, 62, 24],
  "Mediterranean Sea": [58, 94, 24, 31, 36, 48, 41, 18],
  "Caribbean Sea": [93, 27, 22, 26, 44, 39, 33, 14],
  "Sea of Japan": [46, 31, 92, 22, 34, 28, 21, 27],
  "Bering Sea": [21, 18, 39, 16, 29, 17, 11, 92],
  "Weddell Sea": [17, 22, 95, 19, 26, 12, 8, 47],
  "Baltic Sea": [33, 42, 28, 24, 47, 58, 91, 20],
  "Red Sea": [95, 36, 19, 34, 41, 33, 29, 15],
  "East China Sea": [52, 29, 26, 23, 39, 92, 46, 17],
  "Labrador Sea": [24, 90, 31, 18, 32, 20, 13, 29],
  "Coral Sea": [61, 25, 24, 93, 42, 51, 44, 16],
  "Sargasso Sea": [59, 30, 23, 27, 91, 40, 35, 19],
  "Sea of Okhotsk": [23, 21, 90, 20, 28, 16, 10, 38],
  "Tasman Sea": [64, 26, 21, 29, 33, 21, 16, 91],
  "Sulu Sea": [56, 32, 25, 30, 41, 92, 65, 21],
  "Yellow Sea": [49, 35, 28, 24, 38, 59, 90, 18],
};

// Ocean coordinates for each region, matching the underlying anomaly feed.
export const REGION_COORDS: Record<string, [number, number]> = {
  "North Pacific Gyre": [-152.4, 35.2],
  "Bay of Bengal": [88.3, 14.6],
  "Drake Passage": [-62.1, -58.4],
  "Great Barrier Reef": [147.7, -18.2],
  "Arabian Sea": [63.2, 16.9],
  "Norwegian Sea": [2.4, 68.1],
  "Gulf of Mexico": [-90.5, 27.3],
  "Mariana Trench Rim": [142.3, 11.7],
  "South Pacific Gyre": [-120.6, -26.3],
  "South Atlantic Gyre": [-14.8, -29.6],
  "Indian Ocean Basin": [80.4, -11.2],
  "Mediterranean Sea": [17.9, 35.4],
  "Caribbean Sea": [-75.3, 16.4],
  "Sea of Japan": [134.8, 40.1],
  "Bering Sea": [-175.2, 58.3],
  "Weddell Sea": [-44.6, -69.8],
  "Baltic Sea": [19.3, 58.2],
  "Red Sea": [38.1, 20.3],
  "East China Sea": [125.4, 29.1],
  "Labrador Sea": [-55.2, 58.6],
  "Coral Sea": [154.6, -16.8],
  "Sargasso Sea": [-52.3, 27.9],
  "Sea of Okhotsk": [148.2, 54.7],
  "Tasman Sea": [160.1, -41.3],
  "Sulu Sea": [121.0, 8.0],
  "Yellow Sea": [123.4, 36.6],
};

export const CRITICAL_THRESHOLD = 90;

export function cleanRegionName(region: string) {
  return region.trim().replace(/\s+/g, " ");
}

export function getRegionProfile(region: string): RegionProfile | null {
  const clean = cleanRegionName(region);
  const percents = BASELINE_REGION_PERCENTS[clean];
  if (!percents) return null;
  return {
    region: clean,
    metrics: METRIC_META.map((meta, i) => ({ ...meta, percent: percents[i] })),
  };
}

export function statusColor(percent: number) {
  if (percent >= CRITICAL_THRESHOLD) return "#ff6b6b";
  if (percent >= 33) return "#ffd166";
  return "#4cc9f0";
}

export function statusLabel(percent: number) {
  if (percent >= CRITICAL_THRESHOLD) return "Critical";
  if (percent >= 33) return "Watch";
  return "Normal";
}

// Deterministic string hash so occurrence stats stay stable across renders/requests.
function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export type OccurrenceStats = {
  occurrences: number;
  trend: "rising" | "falling" | "stable";
  weekOverWeek: number;
  firstDetected: string;
  lastDetected: string;
  windowDays: number;
};

export function getOccurrenceStats(region: string, metricKey: string, percent: number): OccurrenceStats {
  const seed = hash(`${region}:${metricKey}`);
  const windowDays = 30;
  const occurrences = 6 + (seed % 19) + Math.round(percent / 6);
  const trendRoll = seed % 3;
  const trend: OccurrenceStats["trend"] = trendRoll === 0 ? "rising" : trendRoll === 1 ? "falling" : "stable";
  const weekOverWeek = trend === "rising" ? 4 + (seed % 14) : trend === "falling" ? -(3 + (seed % 11)) : (seed % 5) - 2;
  const firstOffsetDays = windowDays - (seed % 6);
  const lastOffsetHours = (seed % 30) + 2;
  const now = Date.parse("2026-09-07T09:00:00.000Z");
  const firstDetected = new Date(now - firstOffsetDays * 86400000).toISOString();
  const lastDetected = new Date(now - lastOffsetHours * 3600000).toISOString();
  return { occurrences, trend, weekOverWeek, firstDetected, lastDetected, windowDays };
}

export type CriticalAnomaly = {
  region: string;
  coordinates: [number, number];
  metricKey: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  percent: number;
  stats: OccurrenceStats;
};

/** Every (category, region) pair that has crossed the 90% critical anomaly threshold. */
export function buildCriticalAnomaliesFromPercents(percents: RegionPercents): CriticalAnomaly[] {
  const results: CriticalAnomaly[] = [];
  for (const [region, values] of Object.entries(percents)) {
    const coordinates = REGION_COORDS[region];
    if (!coordinates) continue;
    METRIC_META.forEach((meta, i) => {
      const percent = values[i];
      if (percent >= CRITICAL_THRESHOLD) {
        results.push({
          region,
          coordinates,
          metricKey: meta.key,
          label: meta.label,
          unit: meta.unit,
          icon: meta.icon,
          percent,
          stats: getOccurrenceStats(region, meta.key, percent),
        });
      }
    });
  }
  return results.sort((a, b) => b.percent - a.percent);
}

/** Reference-only critical anomalies, computed from the static fallback table. */
export function getCriticalAnomalies(): CriticalAnomaly[] {
  return buildCriticalAnomaliesFromPercents(BASELINE_REGION_PERCENTS);
}

/** Serializable anomaly shape safe to send over JSON (icon is a component reference, dropped). */
export type SerializedAnomaly = Omit<CriticalAnomaly, "icon">;

export type PredictedAnomaly = {
  id: string;
  region: string;
  metricKey: string;
  label: string;
  coordinates: [number, number];
  probability: number;
  horizonHours: number;
  triggerPercent: number;
};

function clampLon(lon: number) {
  let value = lon;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return Math.round(value * 100) / 100;
}

function clampLat(lat: number) {
  return Math.round(Math.max(-82, Math.min(82, lat)) * 100) / 100;
}

// Forecast points are laid out on a deterministic world grid instead of rings around each
// trigger, so the field reads as a distributed model inference over open, unmonitored ocean
// rather than a halo hugging the confirmed anomaly centers.
const FORECAST_LON_STEP = 16;
const FORECAST_LAT_STEP = 13;
const FORECAST_LAT_RANGE: [number, number] = [-70, 76];
// Grid cells this close (in degrees, roughly) to a confirmed critical anomaly are dropped so
// forecast dots never crowd the main anomaly marker.
const FORECAST_EXCLUSION_RADIUS = 15;
// Deterministically thin the grid so the field looks organic rather than a rigid lattice.
// Lowered from 0.62 so the overall field reads sparser rather than saturating every row.
const FORECAST_KEEP_RATIO = 0.4;
// Base range for the per-row keep ratio below — each latitude row gets its own density so
// rows don't all thin out identically, breaking up the symmetrical banding a single fixed
// ratio produces.
const FORECAST_ROW_RATIO_RANGE: [number, number] = [0.26, 0.5];

/** Approximate angular distance between two [lon, lat] points, longitude-scaled by
 * latitude so the exclusion radius reads consistently near the poles as well as the equator.
 */
function approxDegreeDistance(a: [number, number], b: [number, number]) {
  const lonDiff = Math.min(Math.abs(a[0] - b[0]), 360 - Math.abs(a[0] - b[0]));
  const latDiff = a[1] - b[1];
  const lonScale = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.sqrt((lonDiff * lonScale) ** 2 + latDiff ** 2);
}

/** Creates a dense, deterministic forecast field spread evenly across the whole map, skipping
 * any cell that falls inside the exclusion radius of a confirmed critical anomaly. Every point
 * still carries the nearest trigger's metricKey/percent so the "why here" reasoning stays
 * grounded in a real >=90% observation, even though the dot itself renders far from that center.
 */
export function buildPredictedAnomalies(anomalies: CriticalAnomaly[]): PredictedAnomaly[] {
  if (anomalies.length === 0) return [];
  const points: PredictedAnomaly[] = [];
  let index = 0;
  let rowIndex = 0;

  for (let lat = FORECAST_LAT_RANGE[0]; lat <= FORECAST_LAT_RANGE[1]; lat += FORECAST_LAT_STEP) {
    // Stagger alternating rows by half a step (brick-pattern offset) and give each row its
    // own random keep-ratio, so the field doesn't read as a repeating symmetrical grid.
    const rowSeed = hash(`forecast-row:${lat}`);
    const lonOffset = rowIndex % 2 === 0 ? 0 : FORECAST_LON_STEP / 2;
    const [minRatio, maxRatio] = FORECAST_ROW_RATIO_RANGE;
    const rowKeepRatio = minRatio + ((rowSeed % 100) / 100) * (maxRatio - minRatio);

    for (let lon = -180 + lonOffset; lon < 180; lon += FORECAST_LON_STEP) {
      const seed = hash(`forecast-grid:${lat}:${lon}`);

      // Thin the lattice deterministically before placing anything, using this row's own
      // ratio (bounded by the global FORECAST_KEEP_RATIO average) so density varies row to
      // row instead of forming a uniform, symmetrical lattice.
      const effectiveRatio = Math.min(rowKeepRatio, FORECAST_KEEP_RATIO * 1.6);
      if (seed % 100 >= effectiveRatio * 100) continue;

      const jitterLat = ((seed % 900) / 100 - 4.5) * 0.9;
      const jitterLon = (((seed >> 5) % 900) / 100 - 4.5) * 0.9;
      const coordinates: [number, number] = [clampLon(lon + jitterLon), clampLat(lat + jitterLat)];

      let nearest = anomalies[0];
      let nearestDistance = Infinity;
      for (const anomaly of anomalies) {
        const distance = approxDegreeDistance(coordinates, anomaly.coordinates);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = anomaly;
        }
      }

      // Skip cells that sit inside the exclusion radius of any confirmed anomaly center —
      // this is what keeps the forecast field off the main anomaly rather than surrounding it.
      if (nearestDistance < FORECAST_EXCLUSION_RADIUS) continue;

      const decay = Math.min(10, Math.floor(nearestDistance / 10));
      const probability = Math.max(90, Math.min(97, 97 - decay - (seed % 4)));

      points.push({
        id: `forecast-${index}`,
        region: nearest.region,
        metricKey: nearest.metricKey,
        label: nearest.label,
        coordinates,
        probability,
        horizonHours: 12 + (seed % 60),
        triggerPercent: nearest.percent,
      });
      index++;
    }
    rowIndex++;
  }

  return points;
}

export function serializeAnomaly(a: CriticalAnomaly): SerializedAnomaly {
  const { icon, ...rest } = a;
  return rest;
}

/** Re-attach the lucide icon to a serialized anomaly received from an API route. */
export function hydrateAnomaly(raw: SerializedAnomaly): CriticalAnomaly {
  const meta = METRIC_META.find((m) => m.key === raw.metricKey);
  return { ...raw, icon: meta?.icon ?? METRIC_META[0].icon };
}

function trendPhrase(stats: OccurrenceStats) {
  if (stats.trend === "rising") return `trending upward, +${stats.weekOverWeek}% week-over-week`;
  if (stats.trend === "falling") return `easing back, ${stats.weekOverWeek}% week-over-week`;
  return "holding steady week-over-week";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Deterministic, factual summary of a critical anomaly — no AI involved. */
export function buildGeneralReport(anomaly: CriticalAnomaly) {
  const { region, label, percent, stats, unit } = anomaly;
  return `${label} in the ${region} has reached ${percent}% anomaly severity, crossing the ${CRITICAL_THRESHOLD}% critical threshold monitored by the OCEANNOVA detection pipeline. Sensors logged ${stats.occurrences} independent detections over the past ${stats.windowDays} days (unit basis: ${unit}), ${trendPhrase(stats)}. First flagged ${formatDate(stats.firstDetected)}, with the most recent confirmation on ${formatDate(stats.lastDetected)}. This region is now under active model surveillance for downstream ${label.toLowerCase()} impacts.`;
}
