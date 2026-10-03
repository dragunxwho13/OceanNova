import { NextResponse } from "next/server";
import { getOutlooks } from "@/lib/ml/forecast-service";
import { health } from "@/lib/ml/engine";
import { FORECAST_REGIONS, HORIZON_DAYS } from "@/lib/ml/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * CNN 7-day anomaly outlook for the tracked ocean regions.
 *
 * GET /api/forecast          → every region, ranked by predicted probability
 * GET /api/forecast?region=… → one region (name must match REGION_COORDS)
 *
 * Pipeline: NOAA CoastWatch ERDDAP daily series (chlor_a/SST/Kd490, no key)
 * → ForecastCNN (in-repo TensorFlow.js) → evidence → Gemini 2.5 Flash
 * explanation when GEMINI_API_KEY is set (model-summary fallback otherwise).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const only = searchParams.get("region");
  const engineInfo = await health();
  const outlooks = await getOutlooks();
  const filtered = only
    ? outlooks.filter((o) => o.region.toLowerCase() === only.toLowerCase() || o.region.toLowerCase().includes(only.toLowerCase()))
    : outlooks;

  return NextResponse.json({
    ok: engineInfo.ok,
    model: engineInfo.model_version,
    engine: engineInfo.engine,
    model_loaded: engineInfo.model_loaded,
    provenance: engineInfo.provenance,
    trained_at: engineInfo.trained_at,
    horizon_days: HORIZON_DAYS,
    regions: FORECAST_REGIONS.length,
    live_regions: outlooks.filter((o) => o.source === "live").length,
    updated_at: new Date().toISOString(),
    outlooks: filtered,
    note: "Probabilities are ForecastCNN likelihoods over the next 7 days from the 14-day input window — not detections, not certainties.",
  });
}
