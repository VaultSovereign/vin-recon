import { NextRequest, NextResponse } from "next/server";
import { reconstruct } from "@/lib/engine/reconstruct";
import { ReconstructRequest } from "@/lib/types";

/** CORS so the local browser addon can POST source observations from chrome-extension:// */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "JSON body must be an object." }, { status: 400, headers: CORS_HEADERS });
  }
  const body = parsed as ReconstructRequest;
  if (!body.vin || typeof body.vin !== "string") {
    return NextResponse.json({ error: "A 'vin' string field is required." }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await reconstruct(body);
    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400, headers: CORS_HEADERS });
  }
}
