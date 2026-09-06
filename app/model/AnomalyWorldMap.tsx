"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Crosshair, Layers3, Minus, Plus, RotateCcw, MapPin, Activity, Gauge } from "lucide-react";
import type { AnomalyRecord } from "@/lib/mock";
import { getRegionProfile, statusColor, statusLabel } from "@/lib/region-metrics";

type Props = {
  anomalies: AnomalyRecord[];
  selected: AnomalyRecord | null;
  onSelect: (anomaly: AnomalyRecord) => void;
};

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CATEGORY_COLORS: Record<string, string> = {
  "Sea Surface Temp": "#ff6b6b",
  Salinity: "#ffd166",
  "Current Velocity": "#7b61ff",
  "pH Level": "#00f5d4",
  "Dissolved Oxygen": "#4cc9f0",
  "Chlorophyll-a": "#a7f432",
  "Hydrostatic Pressure": "#f72585",
};

function markerColor(parameter: string) {
  return CATEGORY_COLORS[parameter] ?? "#b9d0dc";
}

function cleanRegion(region: string) {
  return region.trim().replace(/\s+/g, " ");
}

export function AnomalyWorldMap({ anomalies, selected, onSelect }: Props) {
  const orderedAnomalies = useMemo(
    () => [...anomalies].sort((a, b) => a.id - b.id).slice(0, 8),
    [anomalies],
  );
  const locationNumber = (id: number) => orderedAnomalies.findIndex((item) => item.id === id) + 1;
  const selectAndCenter = (anomaly: AnomalyRecord) => {
    onSelect(anomaly);
    setPosition({ coordinates: [anomaly.longitude, anomaly.latitude], zoom: 2.2 });
  };

  
  const [position, setPosition] = useState({ coordinates: [0, 12] as [number, number], zoom: 1 });
  const [showLabels, setShowLabels] = useState(true);
  const categories = useMemo(() => Array.from(new Set(anomalies.map((a) => a.parameter))), [anomalies]);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const showTooltip = (region: string, event: ReactMouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - rect.left + 16;
    const rawY = event.clientY - rect.top + 16;
    setTooltipPos({
      x: Math.min(Math.max(rawX, 8), Math.max(rect.width - 272, 8)),
      y: Math.min(Math.max(rawY, 8), Math.max(rect.height - 60, 8)),
    });
    setHoverRegion(region);
  };
  const hideTooltip = () => setHoverRegion(null);
  const hoverProfile = hoverRegion ? getRegionProfile(hoverRegion) : null;

  return (
    <section ref={sectionRef} className="glass relative rounded-3xl">
      <div className="overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 p-5">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bio-cyan">
            <Crosshair className="h-3.5 w-3.5" /> Global anomaly field
          </p>
          <h2 className="mt-2 font-display text-xl font-bold text-foam">Ocean intelligence map</h2>
          <p className="mt-1 max-w-xl font-mono text-[10px] leading-relaxed text-silver/50">
            Select a signal to inspect its model output. Marker geometry encodes severity; color encodes the observed parameter.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLabels((value) => !value)}
          aria-pressed={showLabels}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-silver/65 transition hover:border-bio-cyan/50 hover:text-bio-cyan"
        >
          <Layers3 className="h-3.5 w-3.5" /> {showLabels ? "Labels on" : "Labels off"}
        </button>
      </div>

      <div className="grid gap-2 border-b border-white/8 bg-abyssal-navy/45 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {orderedAnomalies.map((anomaly) => {
          const number = locationNumber(anomaly.id);
          const active = selected?.id === anomaly.id;
          return (
            <button
              key={anomaly.id}
              type="button"
              onClick={() => selectAndCenter(anomaly)}
              onMouseEnter={(event) => showTooltip(anomaly.region, event)}
              onMouseMove={(event) => showTooltip(anomaly.region, event)}
              onMouseLeave={hideTooltip}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-bio-cyan/60 bg-bio-cyan/10" : "border-white/8 bg-white/[0.02] hover:border-white/20"}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-bio-cyan/35 bg-bio-cyan/10 font-display text-sm font-bold text-bio-cyan">{number}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-silver/55"><MapPin className="h-3 w-3 text-bio-cyan" /> {cleanRegion(anomaly.region)}</span>
                  <span className="mt-1 block truncate font-display text-xs font-semibold text-foam">{anomaly.title}</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[9px] text-silver/55">
                <span><Activity className="mb-0.5 inline h-3 w-3" /> {anomaly.parameter}</span>
                <span><Gauge className="mb-0.5 inline h-3 w-3" /> {Math.round(anomaly.confidence * 100)}%</span>
                <span className="text-right uppercase" style={{ color: markerColor(anomaly.parameter) }}>{anomaly.severity}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative bg-[#062e53]">
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 145 }}
          width={900}
          height={440}
          className="h-auto w-full"
          role="img"
          aria-label="World map showing ocean anomaly detections"
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
            {anomalies.map((anomaly) => {
              const color = markerColor(anomaly.parameter);
              const isSelected = selected?.id === anomaly.id;
              const radius = anomaly.severity === "high" ? 7 : anomaly.severity === "medium" ? 5.5 : 4;
              return (
                <Marker key={anomaly.id} coordinates={[anomaly.longitude, anomaly.latitude]}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${anomaly.title}, ${anomaly.severity} severity`}
                    onClick={() => selectAndCenter(anomaly)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") selectAndCenter(anomaly);
                    }}
                    onMouseEnter={(event) => showTooltip(anomaly.region, event)}
                    onMouseMove={(event) => showTooltip(anomaly.region, event)}
                    onMouseLeave={hideTooltip}
                    className="cursor-pointer"
                  >
                    <circle r={radius * 2.6} fill={color} opacity={isSelected ? 0.2 : 0.08} className="animate-ping-soft" />
                    <circle r={radius + (isSelected ? 2 : 0)} fill={color} opacity={0.18} stroke={isSelected ? "#def3f6" : color} strokeWidth={isSelected ? 1.5 : 0.8} />
                    <circle r={radius} fill={color} stroke="#062e53" strokeWidth={1.4} />
                    {showLabels && <><text y={-15} textAnchor="middle" fill="#def3f6" fontSize={10} fontWeight={700} fontFamily="monospace" className="pointer-events-none">{locationNumber(anomaly.id)}</text><text y={-4} textAnchor="middle" fill="#def3f6" fontSize={5.5} fontFamily="monospace" className="pointer-events-none">{cleanRegion(anomaly.region)}</text></>}
                  </g>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#062e53]/90 p-2 backdrop-blur-md">
          {categories.map((category) => (
            <span key={category} className="flex items-center gap-1.5 font-mono text-[8px] text-silver/65">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: markerColor(category) }} /> {category}
            </span>
          ))}
        </div>

        <div className="absolute right-4 top-4 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#062e53]/90 backdrop-blur-md">
          <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.min(value.zoom * 1.35, 5) }))} className="p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPosition((value) => ({ ...value, zoom: Math.max(value.zoom / 1.35, 1) }))} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPosition({ coordinates: [0, 12], zoom: 1 })} className="border-t border-white/10 p-2 text-silver/70 transition hover:text-bio-cyan" aria-label="Reset map"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      </div>

      {hoverProfile && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-2xl border border-white/12 bg-[#04263f]/95 p-4 shadow-2xl backdrop-blur-md"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-bio-cyan">
            <MapPin className="h-3 w-3" /> {hoverProfile.region}
          </p>
          <p className="mt-0.5 font-display text-sm font-semibold text-foam">Full anomaly profile</p>
          <div className="mt-3 space-y-2.5">
            {hoverProfile.metrics.map((metric) => {
              const color = statusColor(metric.percent);
              const Icon = metric.icon;
              return (
                <div key={metric.key}>
                  <div className="flex items-center justify-between font-mono text-[9px] text-silver/65">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" /> {metric.label}
                    </span>
                    <span className="font-semibold" style={{ color }}>
                      {metric.percent}% · {statusLabel(metric.percent)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${metric.percent}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
