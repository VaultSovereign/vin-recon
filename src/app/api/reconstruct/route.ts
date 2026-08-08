import { NextRequest, NextResponse } from "next/server";
import { reconstruct } from "@/lib/engine/reconstruct";
import { ReconstructRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: ReconstructRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.vin || typeof body.vin !== "string") {
    return NextResponse.json({ error: "A 'vin' string field is required." }, { status: 400 });
  }

  try {
    const result = await reconstruct(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
