import { NextResponse } from "next/server";
import { getLiveRegionPercents } from "@/lib/live-anomalies";
import { buildCriticalAnomaliesFromPercents, buildPredictedAnomalies, serializeAnomaly } from "@/lib/region-metrics";
import { loadLandFeatures, relocateForecastPointsToOcean } from "@/lib/land-mask";

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
  const rawPredictedAnomalies = buildPredictedAnomalies(critical);
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
      method: "critical-threshold spatial forecast",
      threshold: 90,
      markerCount: predictedAnomalies.length,
      horizonHours: "12-60",
    },
  });
}
