import { NextResponse } from "next/server";
import { health } from "@/lib/ml/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Model backend health. Always reports the in-repo CNN engine (loaded from
 * ml/weights) and, if ML_SERVICE_URL is configured, the remote service status.
 */
export async function GET() {
  const local = await health();
  const base = process.env.ML_SERVICE_URL;
  let remote: { configured: boolean; ok?: boolean; detail?: unknown } = { configured: Boolean(base) };
  if (base) {
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
      remote = { configured: true, ok: r.ok, detail: await r.json().catch(() => null) };
    } catch (e) {
      remote = { configured: true, ok: false, detail: e instanceof Error ? e.message : "unreachable" };
    }
  }
  return NextResponse.json(
    { ...local, connected: local.ok || remote.ok === true, remote },
    { status: local.ok || remote.ok ? 200 : 503 },
  );
}
