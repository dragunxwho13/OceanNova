import { NextResponse } from "next/server";
import { getLiveRegionPercents } from "@/lib/live-anomalies";
import { buildCriticalAnomaliesFromPercents, buildPredictedAnomalies, serializeAnomaly, type PredictedAnomaly } from "@/lib/region-metrics";
import { loadLandFeatures, relocateForecastPointsToOcean } from "@/lib/land-mask";
import { getOutlooks } from "@/lib/ml/forecast-service";

/** ForecastCNN cause → the closest metric lane on the map for coloring/labels. */
const CAUSE_TO_METRIC: Record<string, { key: string; label: string }> = {
  harmful_algal_bloom: { key: "hab", label: "HAB Risk Index" },
  eutrophication: { key: "chlorophyll", label: "Chlorophyll Bloom" },
  oil_spill: { key: "oilspill", label: "Oil Slick Signature" },
  sediment_plume: { key: "turbidity", label: "Sediment Turbidity" },
  coastal_runoff: { key: "turbidity", label: "Sediment Turbidity" },
  thermal_anomaly: { key: "sst", label: "Sea Surface Temp" },
  unknown_mixed: { key: "current", label: "Current Shear" },
};

/**
 * Critical ocean anomalies for the world map, computed from REAL NOAA (NDBC buoys) and
 * NASA PACE (OCI ocean-color passes) telemetry, run through Gemini to turn raw readings
 * into per-region, per-metric anomaly severities. Falls back to a static reference table
 * if the live feeds or the model are unavailable, and always says which one it served.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { percents, liveComputed, updatedAt, paceLive, noaaLive } = await getLiveRegionPercents();
  const critical = buildCriticalAnomaliesFromPercents(percents);
  const anomalies = critical.map(serializeAnomaly);

  // CNN outlook points (ForecastCNN over real regional daily series) lead the field,
  // followed by the spatial lattice of inference candidates. Any failure in the
  // forecast layer silently degrades to the lattice — the map must never break.
  let cnnPoints: PredictedAnomaly[] = [];
  let cnnEngine = "unavailable";
  try {
    const outlooks = await getOutlooks();
    cnnEngine = outlooks[0]?.forecastModel ?? "unavailable";
    cnnPoints = outlooks
      .filter((o) => o.risk && o.forecastModel !== "unavailable" && o.source !== "reference")
      .map((o) => {
        const metric = CAUSE_TO_METRIC[o.cause] ?? { key: "current", label: "Current Shear" };
        return {
          id: `cnn-${o.region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          region: o.region,
          metricKey: metric.key,
          label: `${metric.label} (CNN ${o.probability}%)`,
          coordinates: o.coordinates,
          probability: o.probability,
          horizonHours: Math.max(12, o.peakDay * 24),
          triggerPercent: o.probability,
        };
      });
  } catch {
    /* forecast layer optional — lattice remains */
  }

  const rawPredictedAnomalies = [...cnnPoints, ...buildPredictedAnomalies(critical)];
  const land = await loadLandFeatures();
  const predictedAnomalies = relocateForecastPointsToOcean(rawPredictedAnomalies, land);

  return NextResponse.json({
    updatedAt,
    liveComputed,
    source: liveComputed ? "live-environmental-context" : "reference-index",
    paceLive,
    noaaLive,
    anomalies,
    predictedAnomalies,
    forecast: {
      method: cnnPoints.length ? "ForecastCNN regional outlook + critical-threshold spatial lattice" : "critical-threshold spatial forecast",
      engine: cnnPoints.length ? cnnEngine : "lattice-only",
      cnnPoints: cnnPoints.length,
      threshold: 90,
      markerCount: predictedAnomalies.length,
      horizonHours: "12-168",
    },
  });
}
