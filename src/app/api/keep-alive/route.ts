import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_OCR_API_URL ||
    process.env.OCR_SERVICE_URL ||
    "http://127.0.0.1:8000";

  const startedAt = Date.now();
  try {
    const res = await fetch(`${backendUrl}/api/v1/ping`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok,
      backend_status: res.status,
      latency_ms: Date.now() - startedAt,
      backend: data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        latency_ms: Date.now() - startedAt,
        error: err instanceof Error ? err.message : "Backend unreachable",
      },
      { status: 503 }
    );
  }
}

