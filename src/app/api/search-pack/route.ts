import { NextRequest, NextResponse } from "next/server";
import { buildSearchPack, defaultOpenPackIds } from "@/lib/engine/searchPack";
import { isWellFormedVin } from "@/lib/vinCheckDigit";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** GET /api/search-pack?vin=... — privacy-first search pack for web UI + browser addon. */
export async function GET(req: NextRequest) {
  const vin = (req.nextUrl.searchParams.get("vin") ?? "").trim().toUpperCase();
  if (!isWellFormedVin(vin)) {
    return NextResponse.json(
      { error: "Query param 'vin' must be a well-formed 17-character VIN." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const pack = buildSearchPack(vin);
  return NextResponse.json(
    {
      pack,
      defaultOpenIds: defaultOpenPackIds(),
      note: "SEARCH_LEADS_GENERATED only — open links manually or via the addon. Nothing is scraped.",
    },
    { headers: CORS_HEADERS }
  );
}
