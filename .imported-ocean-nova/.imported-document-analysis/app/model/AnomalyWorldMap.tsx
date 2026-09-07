"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import useSWR from "swr";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Crosshair, Layers3, Minus, Plus, RotateCcw, MapPin, Radar, TrendingUp, TrendingDown, Minus as MinusIcon, Satellite, Anchor, Wifi, BrainCircuit, DatabaseZap } from "lucide-react";
import {
  METRIC_META,
  buildPredictedAnomalies,
  getCriticalAnomalies,
  hydrateAnomaly,
  statusColor,
  statusLabel,
  type CriticalAnomaly,
  type PredictedAnomaly,
  type SerializedAnomaly,
} from "@/lib/region-metrics";
import { AnomalyReportPanel } from "./AnomalyReportPanel";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type Granule = { id: string; title: string; timeStart: string; timeEnd: string; bbox: string | null };
type BuoyObs = { station: string; name: string; lat: number; lon: number; waterTempC: number | null; waveHeightM: number | null; time: string };
type OceanDataResponse = {
  updatedAt: string;
  pace: { source: string; live: boolean; granules: Granule[] };
  noaa: { source: string; live: boolean; stations: BuoyObs[]; avgWaterTempC: number | null };
};
type LiveAnomaliesResponse = {
  updatedAt: string;
  liveComputed: boolean;
  source: string;
  paceLive: boolean;
  noaaLive: boolean;
  anomalies: SerializedAnomaly[];
};

type RealPacePoint = {
  id: string;
  latitude: number;
  longitude: number;
  anomaly_score: number;
  confidence: number;
  severity: string;
  cause: string;
  noaa?: { station?: string | null; distance_km?: number | null; water_temp_c?: number | null; wave_height_m?: number | null };
};

type RealPaceResponse = {
  live: boolean;
  status?: string;
  message?: string;
  updated_at?: string;
  pace_granules?: number;
  candidate_pixels?: number;
  valid_coordinates?: number;
  anomaly_pixels?: number;
  map_points?: number;
  points: RealPacePoint[];
};
function granuleCentroid(bbox: string | null): [number, number] | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

async function fetchOceanData(): Promise<OceanDataResponse> {
  const res = await fetch("/api/ocean-data", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load live ocean data");
  return res.json();
}

async function fetchLiveAnomalies(): Promise<LiveAnomaliesResponse> {
  const res = await fetch("/api/live-anomalies", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load live anomaly analysis");
  return res.json();
}

async function fetchRealPace(): Promise<RealPaceResponse> {
  const res = await fetch("/api/real-anomalies", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load real PACE pixels");
  return res.json();
}
const CATEGORY_COLORS: Record<string, string> = {
  sst: "#ff6b6b",
  salinity: "#ffd166",
  current: "#7b61ff",
  ph: "#00f5d4",
  oxygen: "#4cc9f0",
  chlorophyll: "#a7f432",
  hab: "#f72585",
  pressure: "#ff9f1c",
};

function markerColor(metricKey: string) {
  return CATEGORY_COLORS[metricKey] ?? "#b9d0dc";
}

// Colors for the real PACE pixel "cause" categories reported by the ml_service anomaly
// engine (ml_service/real_engine.py::_cause_scores). These are the actual detected causes
// for real satellite pixels, distinct from the modeled-reference METRIC_META categories.
const CAUSE_COLORS: Record<string, string> = {
  "bloom / phytoplankton": "#a7f432",
  "sediment / resuspension": "#ffd166",
  "cdom / terrestrial influence": "#7b61ff",
  "thermal / physical context": "#ff6b6b",
  "unknown / mixed": "#4cc9f0",
};

function causeColor(cause: string) {
  return CAUSE_COLORS[cause.toLowerCase()] ?? "#b9d0dc";
}

function causeLabel(cause: string) {
  return cause.replace(/\b\w/g, (c) => c.toUpperCase());
}

function trendGlyph(trend: CriticalAnomaly["stats"]["trend"]) {
  return trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : MinusIcon;
}

// Physical-plausibility templates used to explain each judgment-forecast dot. These are
// derived locally from the metric category and the nearby trigger anomaly's own severity —
// no live PACE feed or network call is needed to produce a defensible "why here" reasoning.
const FORECAST_CAUSE: Record<string, (region: string, triggerPercent: number) => string> = {
  sst: (region, t) =>
    `Thermal advection from the ${region} hotspot (${t}% severity) plus reduced mixed-layer depth in this cell raises the odds of a secondary warm-water pocket forming here.`,
  salinity: (region, t) =>
    `Surface currents downstream of the ${region} freshwater pulse (${t}% severity) can carry a diluted-salinity tongue into this cell within the forecast window.`,
  current: (region, t) =>
    `Eddy shedding from the ${region} current disruption (${t}% severity) often spins off a secondary circulation anomaly nearby as the parent eddy loses coherence.`,
  ph: (region, t) =>
    `Upwelling patterns linked to the ${region} acidification event (${t}% severity) can advect low-pH water along the shelf break into this cell.`,
  oxygen: (region, t) =>
    `Stratification adjacent to the ${region} hypoxic zone (${t}% severity) limits vertical mixing here too, letting oxygen deficits spread outward.`,
  chlorophyll: (region, t) =>
    `Nutrient runoff feeding the ${region} bloom (${t}% severity) frequently drifts with prevailing currents, seeding a satellite bloom in this cell.`,
  hab: (region, t) =>
    `Warm, nutrient-rich water associated with the ${region} bloom event (${t}% severity) can transport algal cells into this cell before they disperse.`,
  pressure: (region, t) =>
    `The atmospheric system driving the ${region} pressure anomaly (${t}% severity) is wide enough that its edge is statistically likely to reach this cell too.`,
};

function forecastReasoning(point: PredictedAnomaly): string {
  const template = FORECAST_CAUSE[point.metricKey];
  const base = template
    ? template(point.region, point.triggerPercent)
    : `Elevated severity near ${point.region} (${point.triggerPercent}%) statistically raises risk in this unmonitored cell.`;
  return `${base} Model judgment places this at ${point.probability}% probability within a ${point.horizonHours}-hour window — a local inference from existing sensor trends, not a live satellite reading.`;
}

export function AnomalyWorldMap() {
  const baselineAnomalies = useMemo(() => getCriticalAnomalies(), []);
  const { data: liveAnomalyData } = useSWR("live-anomalies-map", fetchLiveAnomalies, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
  });
  const { data: realPace } = useSWR("real-pace-pixels", fetchRealPace, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
  });
  const criticalAnomalies = useMemo(() => {
    if (!liveAnomalyData) return baselineAnomalies;
    return liveAnomalyData.anomalies.map(hydrateAnomaly);
  }, [liveAnomalyData, baselineAnomalies]);

  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(METRIC_META.map((m) => m.key)),
  );
  const [position, setPosition] = useState({ coordinates: [0, 12] as [number, number], zoom: 1 });
  const [showLabels, setShowLabels] = useState(true);
  const [showLive, setShowLive] = useState(true);
  // Forecast points are a local judgment call: they extrapolate from the severity and
  // trend of the confirmed critical anomalies already on the map. No live PACE feed or
  // network round-trip is required, so the toggle works even when NASA/NOAA are offline.
  const [showForecast, setShowForecast] = useState(false);
  const [selectedForecast, setSelectedForecast] = useState<PredictedAnomaly | null>(null);
  const [openReport, setOpenReport] = useState<CriticalAnomaly | null>(null);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<CriticalAnomaly | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hoveredLive, setHoveredLive] = useState<
    | { kind: "pace" | "noaa"; label: string; detail: string }
    | { kind: "pace-pixel"; point: RealPacePoint }
    | { kind: "forecast"; forecast: PredictedAnomaly }
    | null
  >(null);

  const realPacePoints = useMemo(() => {
    if (!realPace?.live) return [];
    const valid = realPace.points.filter(
      (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    );
    const displayLimit = 10000;
    if (valid.length <= displayLimit) return valid;
    return valid.filter((_, index) => index % Math.ceil(valid.length / displayLimit) === 0).slice(0, displayLimit);
  }, [realPace]);

  const { data: ocean } = useSWR("ocean-data-map", fetchOceanData, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
  });

  const paceMarkers = useMemo(() => {
    if (!ocean) return [];
    return ocean.pace.granules
      .map((g) => ({ granule: g, coords: granuleCentroid(g.bbox) }))
      .filter((g): g is { granule: Granule; coords: [number, number] } => g.coords !== null);
  }, [ocean]);

  const visibleAnomalies = useMemo(
    () => criticalAnomalies.filter((a) => activeCategories.has(a.metricKey)),
    [criticalAnomalies, activeCategories],
  );
  const forecastPoints = useMemo(
    () => buildPredictedAnomalies(criticalAnomalies),
    [criticalAnomalies],
  );

  const toggleCategory = (key: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isAllActive = activeCategories.size === METRIC_META.length;
  const setAll = () => setActiveCategories(new Set(METRIC_META.map((m) => m.key)));
  const setNone = () => setActiveCategories(new Set());

  const showTooltip = (anomaly: CriticalAnomaly, event: ReactMouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - rect.left + 16;
    const rawY = event.clientY - rect.top + 16;
    setTooltipPos({
      x: Math.min(Math.max(rawX, 8), Math.max(rect.width - 232, 8)),
      y: Math.min(Math.max(rawY, 8), Math.max(rect.height - 80, 8)),
    });
    setHovered(anomaly);
  };
  const hideTooltip = () => setHovered(null);

  const selectAndCenter = (anomaly: CriticalAnomaly) => {
    setPosition({ coordinates: anomaly.coordinates, zoom: 2.4 });
    setOpenReport(anomaly);
  };

  const explainForecast = (point: PredictedAnomaly) => {
    setSelectedForecast(point);
  };

  return (
    <section ref={sectionRef} className="glass relative rounded-3xl">
      <div className="overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 p-5">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
              <Crosshair className="h-3.5 w-3.5" /> Global critical anomaly field
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-foam">Real PACE + NOAA anomaly map</h2>
            <p className="mt-1 max-w-xl font-mono text-[10px] leading-relaxed text-silver/50">
              Every colored dot on the map is a real NASA PACE OCI satellite pixel flagged by the anomaly
              engine, cross-checked against real NOAA NDBC buoys. Colors show the detected cause. Hover any
              dot for its exact reading. Uniform white dots are the judgment forecast — model-inferred risk
              cells distributed across unmonitored ocean away from confirmed anomaly centers, each
              interactive with its own reasoning on click.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] ${
                liveAnomalyData?.liveComputed ? "border-plankton/50 bg-plankton/10 text-plankton" : "border-white/10 text-silver/55"
              }`}
            >
              {liveAnomalyData?.liveComputed ? <BrainCircuit className="h-3.5 w-3.5" /> : <DatabaseZap className="h-3.5 w-3.5" />}
              {liveAnomalyData ? (liveAnomalyData.liveComputed ? "Gemini live analysis" : "Reference dataset") : "Analyzing…"}
            </span>
            <button
              type="button"
              onClick={() => setShowLive((value) => !value)}
              aria-pressed={showLive}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                showLive ? "border-electric-teal/50 bg-electric-teal/10 text-electric-teal" : "border-white/10 text-silver/65 hover:border-electric-teal/50 hover:text-electric-teal"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {ocean && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric-teal opacity-70" />}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-electric-teal" />
              </span>
              <Wifi className="h-3.5 w-3.5" /> {showLive ? "Live feed on" : "Live feed off"}
            </button>
            <button
              type="button"
              onClick={() => setShowForecast((value) => !value)}
              aria-pressed={showForecast}
              title="Evidence-backed forecast candidates from real PACE pixels"
              className={`flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                showForecast ? "border-foam/60 bg-foam/10 text-foam" : "border-white/10 text-silver/65 hover:border-foam/50 hover:text-foam"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-foam shadow-[0_0_8px_#def3f6]" /> Forecast {showForecast ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => setShowLabels((value) => !value)}
              aria-pressed={showLabels}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/65 transition hover:border-bio-cyan/50 hover:text-bio-cyan"
            >
              <Layers3 className="h-3.5 w-3.5" /> {showLabels ? "Labels on" : "Labels off"}
            </button>
          </div>
        </div>

        {/* Live source status strip */}
        <div className="flex flex-wrap items-center gap-4 border-b border-white/8 bg-electric-teal/[0.03] px-5 py-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
            <Satellite className="h-3 w-3 text-electric-teal" />
            NASA PACE OCI:{" "}
            <span className={ocean?.pace.live ? "text-electric-teal" : "text-solar"}>
              {ocean ? (ocean.pace.live ? `${ocean.pace.granules.length} live granules` : "cached reference") : "connecting…"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
            <Anchor className="h-3 w-3 text-bio-cyan" />
            NOAA CO-OPS:{" "}
            <span className={ocean?.noaa.live ? "text-bio-cyan" : "text-solar"}>
              {ocean ? (ocean.noaa.live ? `${ocean.noaa.stations.length} live buoys` : "cached reference") : "connecting…"}
              {ocean?.noaa.avgWaterTempC != null ? ` · avg ${ocean.noaa.avgWaterTempC}°C` : ""}
            </span>
          </span>
          {realPace?.live && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/55">
              <span className="h-2 w-2 rounded-full bg-solar" />
              PACE anomalies: <span className="text-solar">{(realPace.anomaly_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· analyzed {(realPace.candidate_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· valid coords {(realPace.valid_coordinates ?? realPace.candidate_pixels ?? 0).toLocaleString()}</span>
              <span className="text-silver/35">· rendered {realPacePoints.length.toLocaleString()}</span>
            </span>
          )}
          {ocean && (
            <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.14em] text-silver/35">
              synced {new Date(ocean.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-abyssal-navy/45 p-4">
          <button
            type="button"
            onClick={isAllActive ? setNone : setAll}
            className="mr-1 rounded-full border border-white/15 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-silver/60 transition hover:border-white/30 hover:text-foam"
          >
            {isAllActive ? "Clear all" : "Select all"}
          </button>
          {METRIC_META.map((meta) => {
            const active = activeCategories.has(meta.key);
            const count = criticalAnomalies.filter((a) => a.metricKey === meta.key).length;
            const color = markerColor(meta.key);
            const Icon = meta.icon;
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => toggleCategory(meta.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                  active ? "border-transparent text-abyssal-navy" : "border-white/12 text-silver/50 hover:border-white/25"
                }`}
                style={active ? { backgroundColor: color } : undefined}
              >
                <Icon className="h-3 w-3" /> {meta.label}
                <span className={`rounded-full px-1.5 py-px text-[8px] ${active ? "bg-abyssal-navy/25" : "bg-white/10"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Nowcast cards: every card comes from a confirmed critical anomaly region. */}
        {showForecast && (
        <div className="border-b border-white/8 bg-abyssal-navy/30 p-4">
          <p className="mb-3 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-foam/60">
            <Radar className="h-3 w-3" /> Confirmed anomaly nowcast — scroll for the full list
          </p>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
          {visibleAnomalies.length === 0 ? (
            <p className="col-span-full py-6 text-center font-mono text-[11px] text-silver/45">
              No categories selected — toggle a category above to see its critical regions.
            </p>
          ) : (
                visibleAnomalies.map((anomaly) => {

              const color = markerColor(anomaly.metricKey);
              const TrendIcon = trendGlyph(anomaly.stats.trend);
              return (
                <button
                  key={`${anomaly.region}-${anomaly.metricKey}`}
                  type="button"
                  onClick={() => selectAndCenter(anomaly)}
                  onMouseEnter={(event) => showTooltip(anomaly, event)}
                  onMouseMove={(event) => showTooltip(anomaly, event)}
                  onMouseLeave={hideTooltip}
                  data-cursor="hover"
                  className="group rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                  style={{ boxShadow: "0 0 0 rgba(0,0,0,0)" }}
                  onMouseOver={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px ${color}55`)}
                  onMouseOut={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(0,0,0,0)")}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border font-display text-xs font-bold transition-transform duration-300 group-hover:scale-110"
                      style={{ borderColor: `${color}55`, backgroundColor: `${color}1a`, color }}
                    >
                      {anomaly.percent}%
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-silver/55">
                        <MapPin className="h-3 w-3" style={{ color }} /> {anomaly.region}
                      </span>
                      <span className="mt-1 block truncate font-display text-xs font-semibold text-foam">{anomaly.label}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-silver/55">
                    <span className="flex items-center gap-1"><Radar className="h-3 w-3" /> {anomaly.stats.occurrences} detections</span>
                    <span className="flex items-center gap-1" style={{ color: anomaly.stats.trend === "rising" ? "#ff6b6b" : anomaly.stats.trend === "falling" ? "#4cc9f0" : "#ffd166" }}>
                      <TrendIcon className="h-3 w-3" /> {anomaly.stats.trend}
                    </span>
                  </div>
                </button>
              );
            })
          )}
          </div>
        </div>
        )}

        <div className="relative bg-[#062e53]">
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 145 }}
            width={900}
            height={440}
            className="h-auto w-full"
            role="img"
            aria-label="World map showing real NASA PACE anomaly pixels by detected cause"
          >
            <ZoomableGroup
              center={position.coordinates}
              zoom={position.zoom}
              minZoom={1}
              maxZoom={5}
              onMoveEnd={({ coordinates, zoom }) => setPosition({ coordinates, zoom })}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#0a5b83"
                      stroke="#76b6c4"
                      strokeWidth={0.35}
                      style={{ default: { outline: "none" }, hover: { fill: "#1378a5", outline: "none" }, pressed: { outline: "none" } }}
                    />
                  ))
                }
              </Geographies>
              {visibleAnomalies.map((anomaly) => {
                const color = markerColor(anomaly.metricKey);
                const isOpen = openReport?.region === anomaly.region && openReport?.metricKey === anomaly.metricKey;
                // Offset markers that share a region so multiple critical categories
                // at the same place don't render exactly on top of each other.
                const siblings = visibleAnomalies.filter((a) => a.region === anomaly.region);
                const siblingIndex = siblings.indexOf(anomaly);
                const angle = (siblingIndex / Math.max(siblings.length, 1)) * Math.PI * 2;
                const spread = siblings.length > 1 ? 3.6 : 0;
                const coordinates: [number, number] = [
                  anomaly.coordinates[0] + Math.cos(angle) * spread,
                  anomaly.coordinates[1] + Math.sin(angle) * spread,
                ];
                const Icon = anomaly.icon;
                const TrendIcon = trendGlyph(anomaly.stats.trend);
                const cardW = 116;
                const cardH = 50;
                // Counter-scale against the map's zoom so the card always renders at a
                // fixed, readable size instead of ballooning into a giant flat circle.
                const inverseScale = 1 / position.zoom;
                return (
                  <Marker key={`${anomaly.region}-${anomaly.metricKey}`} coordinates={coordinates}>
                    <g style={{ transform: `scale(${inverseScale})`, transformOrigin: "0px 0px" }}>
                      {/* anchor pin at the exact coordinate */}
                      <circle r={9} fill={color} opacity={0.16} className="animate-ping-soft" />
                      <circle r={3.2} fill={color} stroke="#062e53" strokeWidth={1.2} />
                      {/* connector line up to the card */}
                      <line x1={0} y1={-2} x2={0} y2={-cardH - 8} stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 2" />

                      <foreignObject x={-cardW / 2} y={-cardH - 12} width={cardW} height={cardH} style={{ overflow: "visible" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${anomaly.label} critical anomaly at ${anomaly.percent}% in ${anomaly.region}`}
                          onClick={() => selectAndCenter(anomaly)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") selectAndCenter(anomaly);
                          }}
                          onMouseEnter={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                          onMouseMove={(event) => showTooltip(anomaly, event as unknown as ReactMouseEvent)}
                          onMouseLeave={hideTooltip}
                          className="group flex h-full w-full cursor-pointer select-none flex-col justify-between rounded-xl border px-2.5 py-1.5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.06]"
                          style={{
                            background: "linear-gradient(140deg, rgba(4,38,63,0.92), rgba(6,46,83,0.92))",
                            borderColor: isOpen ? color : "rgba(255,255,255,0.14)",
                            boxShadow: isOpen
                              ? `0 0 0 1.5px ${color}, 0 10px 26px -6px ${color}88`
                              : "0 6px 18px -6px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex min-w-0 items-center gap-1 font-mono text-[7px] uppercase tracking-wider text-silver/70">
                              <MapPin className="h-2.5 w-2.5 shrink-0" style={{ color }} />
                              <span className="truncate">{anomaly.region}</span>
                            </span>
                            <TrendIcon
                              className="h-2.5 w-2.5 shrink-0"
                              style={{ color: anomaly.stats.trend === "rising" ? "#ff6b6b" : anomaly.stats.trend === "falling" ? "#4cc9f0" : "#ffd166" }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-display text-lg font-bold leading-none" style={{ color }}>
                              {anomaly.percent}%
                            </span>
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
                              style={{ backgroundColor: `${color}26`, color }}
                            >
                              <Icon className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </foreignObject>
                      {showLabels && (
                        <text y={16} textAnchor="middle" fill="#def3f6" fontSize={6} fontFamily="monospace" opacity={0.55} className="pointer-events-none">
                          {anomaly.label}
                        </text>
                      )}
                    </g>
                  </Marker>
                );
              })}

              {showForecast && forecastPoints.map((forecast) => (
                <Marker key={forecast.id} coordinates={forecast.coordinates}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Judgment forecast: possible ${forecast.label} anomaly near ${forecast.region}, ${forecast.probability}% probability within ${forecast.horizonHours} hours. Click for reasoning.`}
                    onMouseEnter={() => setHoveredLive({ kind: "forecast", forecast })}
                    onMouseLeave={() => setHoveredLive(null)}
                    onClick={() => explainForecast(forecast)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") explainForecast(forecast); }}
                    className="cursor-pointer"
                  >
                    <circle r={5.5} fill="#f8fdff" opacity={0.16} className="animate-ping-soft" />
                    <circle r={3.4} fill="none" stroke="#f8fdff" strokeWidth={0.8} strokeDasharray="1.4 1.4" opacity={0.75} />
                    <circle r={1.5} fill="#f8fdff" stroke="#f8fdff" strokeWidth={0.7} />
                  </g>
                </Marker>
              ))}

              {realPace?.live &&
                realPacePoints.map((point) => {
                  const score = Math.max(0, Math.min(100, point.anomaly_score));
                  const color = causeColor(point.cause);
                  const intensity = score >= 80 ? 1 : score >= 55 ? 0.78 : 0.5;
                  const radius = score >= 80 ? 2.3 : score >= 55 ? 1.8 : 1.3;
                  return (
                    <Marker key={point.id} coordinates={[point.longitude, point.latitude]}>
                      <g
                        role="img"
                        aria-label={`Real PACE pixel anomaly: ${causeLabel(point.cause)}, ${score.toFixed(1)}% anomaly score`}
                        onMouseEnter={() => setHoveredLive({ kind: "pace-pixel", point })}
                        onMouseLeave={() => setHoveredLive(null)}
                        className="cursor-pointer"
                      >
                        {score >= 80 && <circle r={radius * 2.5} fill={color} opacity={0.12 * intensity} />}
                        <circle r={radius} fill={color} opacity={intensity} stroke="#062e53" strokeWidth={0.45} />
                      </g>
                    </Marker>
                  );
                })}

              {showLive &&
                paceMarkers.map(({ granule, coords }) => (
                  <Marker key={granule.id} coordinates={coords}>
                    <g
                      role="img"
                      aria-label={`Live NASA PACE granule pass: ${granule.title}`}
                      onMouseEnter={() =>
                        setHoveredLive({
                          kind: "pace",
                          label: granule.title,
                          detail: `${new Date(granule.timeStart).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                        })
                      }
                      onMouseLeave={() => setHoveredLive(null)}
                      className="cursor-pointer"
                    >
                      <circle r={7} fill="none" stroke="#76b6c4" strokeWidth={1} opacity={0.6} className="animate-ping-soft" />
                      <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke="#def3f6" strokeWidth={1.4} strokeLinecap="round" />
                      <circle r={2.4} fill="#76b6c4" />
                    </g>
                  </Marker>
                ))}

              {showLive &&
                ocean?.noaa.stations.map((buoy) => (
                  <Marker key={buoy.station} coordinates={[buoy.lon, buoy.lat]}>
                    <g
                      role="img"
                      aria-label={`Live NOAA buoy ${buoy.name}, ${buoy.waterTempC ?? "n/a"}°C`}
                      onMouseEnter={() =>
                        setHoveredLive({
                          kind: "noaa",
                          label: buoy.name,
                          detail: buoy.waterTempC != null ? `${buoy.waterTempC}°C water temp` : "no reading",
                        })
                      }
                      onMouseLeave={() => setHoveredLive(null)}
                      className="cursor-pointer"
                    >
                      <circle r={6} fill="#1da2d8" opacity={0.18} className="animate-ping-soft" />
                      <circle r={3.2} fill="#062e53" stroke="#1da2d8" strokeWidth={1.3} />
                      <circle r={1.2} fill="#1da2d8" />
                    </g>
                  </Marker>
                ))}
            </ZoomableGroup>
          </ComposableMap>

          {selectedForecast && (
            <div className="absolute bottom-4 left-4 z-20 max-w-sm rounded-xl border border-white/15 bg-[#04263f]/95 p-4 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-foam">Judgment forecast · why here</p>
                  <p className="mt-1 font-display text-sm font-semibold text-foam">{selectedForecast.label} risk near {selectedForecast.region}</p>
                </div>
                <button type="button" onClick={() => setSelectedForecast(null)} className="font-mono text-xs text-silver/70 hover:text-foam" aria-label="Close forecast report">×</button>
              </div>
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-silver/80">{forecastReasoning(selectedForecast)}</p>
              <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-silver/45">
                {selectedForecast.probability}% probability · {selectedForecast.horizonHours}h horizon · model judgment, not a live reading
              </p>
            </div>
          )}

          {hoveredLive && (
            <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[16rem] rounded-xl border border-electric-teal/30 bg-[#04263f]/95 p-3 shadow-xl backdrop-blur-md">
              {hoveredLive.kind === "forecast" ? (
                <>
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-foam">
                    <span className="h-2 w-2 rounded-full bg-foam shadow-[0_0_6px_#f8fdff]" /> Judgment forecast · {hoveredLive.forecast.label}
                  </p>
                  <p className="mt-1 font-display text-xs font-semibold text-foam">{hoveredLive.forecast.region}</p>
                  <p className="mt-1 font-mono text-[9px] text-silver/65">Probability: {hoveredLive.forecast.probability}%</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/65">Horizon: {hoveredLive.forecast.horizonHours} hours · trigger: {hoveredLive.forecast.triggerPercent}%</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/45">{hoveredLive.forecast.coordinates[1].toFixed(2)}°, {hoveredLive.forecast.coordinates[0].toFixed(2)}° · click for reasoning</p>
                </>
              ) : hoveredLive.kind === "pace-pixel" ? (
                <>
                  <p
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em]"
                    style={{ color: causeColor(hoveredLive.point.cause) }}
                  >
                    <Satellite className="h-3 w-3" /> {causeLabel(hoveredLive.point.cause)}
                  </p>
                  <p className="mt-1 font-display text-xs font-semibold text-foam">Real PACE OCI pixel · {hoveredLive.point.severity} severity</p>
                  <p className="mt-1 font-mono text-[9px] text-silver/65">Anomaly score: {hoveredLive.point.anomaly_score.toFixed(1)}%</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/65">Detector confidence: {(hoveredLive.point.confidence * 100).toFixed(1)}%</p>
                  {hoveredLive.point.noaa?.station && (
                    <p className="mt-0.5 font-mono text-[9px] text-silver/65">
                      NOAA {hoveredLive.point.noaa.station}
                      {hoveredLive.point.noaa.distance_km != null ? ` · ${hoveredLive.point.noaa.distance_km.toFixed(0)} km away` : ""}
                      {hoveredLive.point.noaa.water_temp_c != null ? ` · ${hoveredLive.point.noaa.water_temp_c}°C` : ""}
                    </p>
                  )}
                  <p className="mt-0.5 font-mono text-[9px] text-silver/45">{hoveredLive.point.latitude.toFixed(3)}°, {hoveredLive.point.longitude.toFixed(3)}°</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-electric-teal">
                    {hoveredLive.kind === "pace" ? <Satellite className="h-3 w-3" /> : <Anchor className="h-3 w-3" />}
                    {hoveredLive.kind === "pace" ? "PACE granule" : "NOAA buoy"}
                  </p>
                  <p className="mt-1 truncate font-display text-xs font-semibold text-foam">{hoveredLive.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-silver/50">{hoveredLive.detail}</p>
                </>
              )}
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex max-w-[70%] flex-wrap gap-2 rounded-xl border border-white/10 bg-[#062e53]/90 p-2 backdrop-blur-md">
            {realPace?.live &&
              Object.entries(CAUSE_COLORS).map(([cause, color]) => (
                <span key={cause} className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {causeLabel(cause)}
                </span>
              ))}
            {showLive && (
              <>
                <span className="flex items-center gap-1.5 border-l border-white/10 pl-2 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full border border-foam bg-transparent" /> PACE pass
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
                  <span className="h-2 w-2 rounded-full bg-bio-cyan" /> NOAA buoy
                </span>
              </>
            )}
            {showForecast && (
              <span className="flex items-center gap-1.5 border-l border-white/10 pl-2 font-mono text-[8px] text-silver/50">
                <span className="h-2 w-2 rounded-full bg-foam shadow-[0_0_6px_#f8fdff]" /> Judgment forecast
              </span>
            )}
          </div>

          <div className="absolute right-4 top-4 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#062e53]/90 backdrop-blur-md">
            <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.min(value.zoom * 1.35, 5) }))} className="p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.max(value.zoom / 1.35, 1) }))} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPosition({ coordinates: [0, 12], zoom: 1 })} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Reset map"><RotateCcw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      {hovered && !openReport && (
        <div
          className="pointer-events-none absolute z-30 w-64 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            borderColor: `${markerColor(hovered.metricKey)}40`,
            backgroundColor: "#04263fF2",
          }}
        >
          {/* Header strip: region + status pill */}
          <div
            className="flex items-center justify-between gap-2 border-b border-white/8 px-3.5 py-2"
            style={{ backgroundColor: `${statusColor(hovered.percent)}14` }}
          >
            <span className="flex items-center gap-1.5 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-bio-cyan">
              <MapPin className="h-3 w-3 shrink-0" /> {hovered.region}
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em]"
              style={{ backgroundColor: `${statusColor(hovered.percent)}22`, color: statusColor(hovered.percent) }}
            >
              {statusLabel(hovered.percent)}
            </span>
          </div>

          <div className="p-3.5">
            {/* Category name + icon */}
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${markerColor(hovered.metricKey)}1f`, color: markerColor(hovered.metricKey) }}
              >
                <hovered.icon className="h-3.5 w-3.5" />
              </span>
              <p className="font-display text-sm font-semibold leading-tight text-foam">{hovered.label}</p>
            </div>

            {/* Severity gauge */}
            <div className="mt-3 flex items-center gap-2.5">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${hovered.percent}%`, backgroundColor: statusColor(hovered.percent) }}
                />
              </div>
              <span className="font-mono text-sm font-bold tabular-nums" style={{ color: statusColor(hovered.percent) }}>
                {hovered.percent}%
              </span>
            </div>

            {/* Stat row */}
            <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-silver/60">
              <span className="flex items-center gap-1"><Radar className="h-3 w-3" /> {hovered.stats.occurrences} detections</span>
              <span
                className="flex items-center gap-1"
                style={{ color: hovered.stats.trend === "rising" ? "#ff6b6b" : hovered.stats.trend === "falling" ? "#4cc9f0" : "#ffd166" }}
              >
                {(() => {
                  const TrendIcon = trendGlyph(hovered.stats.trend);
                  return <TrendIcon className="h-3 w-3" />;
                })()}
                {hovered.stats.trend === "rising" ? `+${hovered.stats.weekOverWeek}%` : hovered.stats.trend === "falling" ? `${hovered.stats.weekOverWeek}%` : "stable"} WoW
              </span>
            </div>

            <p className="mt-3 border-t border-white/8 pt-2 text-center font-mono text-[8px] uppercase tracking-[0.14em] text-silver/35">
              Click marker for full causal report
            </p>
          </div>
        </div>
      )}

      <AnomalyReportPanel anomaly={openReport} onClose={() => setOpenReport(null)} />
    </section>
  );
}
