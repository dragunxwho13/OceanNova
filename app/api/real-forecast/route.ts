import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const PointSchema = z.object({
  id: z.string(), latitude: z.number(), longitude: z.number(), anomaly_score: z.number(), confidence: z.number(),
  severity: z.string(), cause: z.string(), cause_probabilities: z.record(z.string(), z.number()).optional(),
  detector_agreement: z.number().optional(), quality_score: z.number().optional(), noaa_corroboration: z.number().optional(),
  nflh: z.number().nullable().optional(), avw: z.number().nullable().optional(), aot_865: z.number().nullable().optional(),
  angstrom: z.number().nullable().optional(), noaa: z.record(z.string(), z.unknown()).optional(),
  spectral_evidence: z.array(z.record(z.string(), z.unknown())).optional(), source: z.string(),
});

const SnapshotSchema = z.object({
  live: z.boolean(), fallback: z.enum(["cached", "simulated"]).optional(), fallback_reason: z.string().optional(), updated_at: z.string().optional(), model_version: z.string().optional(),
  pace_granules: z.number().optional(), candidate_pixels: z.number().optional(), anomaly_pixels: z.number().optional(),
  points: z.array(PointSchema), provenance: z.record(z.string(), z.string()).optional(),
});

function serviceUrl(request: Request) {
  const configured = process.env.ML_SERVICE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // The FastAPI app is deployed as the standard Vercel catch-all function
  // under /api, so preview and production use the same-origin route.
  return new URL("/api", request.url).toString().replace(/\/$/, "");
}

async function localCnnFallback(request: Request) {
  // The remote service is unavailable — serve the in-repo ForecastCNN outlook
  // instead of an empty body, honestly labeled as a regional model outlook.
  try {
    const { getOutlooks } = await import("@/lib/ml/forecast-service");
    const outlooks = await getOutlooks();
    const points = outlooks
      .filter((o) => o.risk && o.forecastModel !== "unavailable")
      .map((o) => ({
        id: `cnn-${o.region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        latitude: o.coordinates[1],
        longitude: o.coordinates[0],
        anomaly_score: o.probability,
        confidence: Math.min(0.95, o.peakSeverity),
        severity: o.probability >= 70 ? "high" : o.probability >= 50 ? "medium" : "low",
        cause: o.cause,
        cause_probabilities: o.causeProbabilities,
        source: `ForecastCNN ${o.forecastModel} · ${o.source} input · not a pixel observation`,
      }));
    return {
      live: points.length > 0,
      status: points.length ? "LOCAL_CNN_OUTLOOK" : "REAL_FEED_UNAVAILABLE",
      fallback: "cached" as const,
      fallback_reason: "ML service unavailable; serving in-repo ForecastCNN regional outlook",
      updated_at: new Date().toISOString(),
      model_version: outlooks[0]?.forecastModel ?? "unavailable",
      pace_granules: 0,
      candidate_pixels: 0,
      anomaly_pixels: points.length,
      points: [],
      forecast_points: points.map((p) => ({ ...p, horizon_hours: "24-168", forecast_basis: "14-day regional ocean-color window scored by ForecastCNN", forecast_type: "cnn-regional-outlook" })),
      provenance: { engine: "local-cnn-tfjs" },
    };
  } catch {
    return null;
  }
}

async function unavailable(request: Request) {
  const local = await localCnnFallback(request);
  if (local) return NextResponse.json(local);
  return NextResponse.json({ live: false, status: "REAL_FEED_UNAVAILABLE", points: [], forecast_points: [] });
}

export async function GET(request: Request) {
  if (!process.env.ML_SERVICE_URL?.trim()) {
    // No remote pipeline configured → serve the in-repo ForecastCNN outlook directly.
    return await unavailable(request);
  }
  const base = serviceUrl(request);
  if (!base) return NextResponse.json({ live: false, status: "PACE_AUTH_REQUIRED", points: [], forecast_points: [] });
  try {
    const headers = {
      ...(process.env.EARTHDATA_TOKEN ? { "x-earthdata-token": process.env.EARTHDATA_TOKEN } : {}),
      ...(process.env.EARTHDATA_USERNAME ? { "x-earthdata-username": process.env.EARTHDATA_USERNAME } : {}),
      ...(process.env.EARTHDATA_PASSWORD ? { "x-earthdata-password": process.env.EARTHDATA_PASSWORD } : {}),
      ...(process.env.NOAA_API_TOKEN ? { "x-noaa-api-token": process.env.NOAA_API_TOKEN } : {}),
    };
    let response = await fetch(`${base}/real/forecast`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers,
    });
    if (response.status === 404) {
      response = await fetch(`${base}/real/anomalies`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers,
      });
    }
    const parsed = SnapshotSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      return await unavailable(request);
    }
    if (!parsed.data.live && !parsed.data.fallback) {
      return await unavailable(request);
    }
    const points = parsed.data.points.filter((point) => point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180);
    const isFallback = Boolean(parsed.data.fallback);
    return NextResponse.json({
      ...parsed.data,
      source: isFallback ? `OCEANNOVA ${parsed.data.fallback} fallback` : "NASA PACE OCI L2 AOP + NOAA NDBC",
      status: isFallback ? `FALLBACK_${parsed.data.fallback?.toUpperCase()}` : "REAL_EVIDENCE_FORECAST",
      forecast_points: points.map((point) => ({
        ...point,
        id: `forecast-${point.id}`,
        horizon_hours: "0–24",
        forecast_basis: "Near-term risk projection from this observed NASA PACE pixel, with NOAA NDBC context when a buoy is within range",
        forecast_type: "evidence-backed-nowcast",
      })),
    });
  } catch {
    return await unavailable(request);
  }
}
