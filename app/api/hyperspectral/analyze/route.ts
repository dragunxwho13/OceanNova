import { NextResponse } from "next/server";
import { analyzeSpectrum } from "@/lib/ml/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * OCEANNOVA spectral analysis.
 *
 * Two engines, same contract:
 *  1. If ML_SERVICE_URL is configured, proxy to the heavy FastAPI pipeline
 *     (full 285-band PACE L2 processing, 7-detector ensemble + CNN backend).
 *  2. Otherwise run the in-repo SpectralCNN (TensorFlow.js, CPU) with its
 *     companion statistical detectors — this is what a plain Vercel deploy
 *     uses, so the product is complete without any extra server.
 *
 * The response always declares which engine produced it (`source`).
 */
export async function POST(req: Request) {
  const base = process.env.ML_SERVICE_URL;
  if (base) {
    try {
      const body = await req.json();
      const response = await fetch(`${base.replace(/\/$/, "")}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
      return NextResponse.json(payload, { status: response.status });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "ML service unavailable", tried: "remote", hint: "Falling back is disabled when ML_SERVICE_URL is set — fix or unset it." },
        { status: 502 },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "expected a JSON body with wavelengths_nm and rrs arrays" }, { status: 400 });
  }
  const parsed = body as { wavelengths_nm?: unknown; rrs?: unknown };
  if (!Array.isArray(parsed.wavelengths_nm) || !Array.isArray(parsed.rrs)) {
    return NextResponse.json(
      { ok: false, error: "expected { wavelengths_nm: number[], rrs: number[] } — at least 16 valid bands" },
      { status: 400 },
    );
  }
  if (parsed.wavelengths_nm.length < 16) {
    return NextResponse.json({ ok: false, error: `too few bands (${parsed.wavelengths_nm.length}); the model needs ≥16` }, { status: 400 });
  }

  const result = await analyzeSpectrum(parsed as Parameters<typeof analyzeSpectrum>[0]);
  if (!result.ok) return NextResponse.json(result, { status: 503 });
  return NextResponse.json(result);
}
