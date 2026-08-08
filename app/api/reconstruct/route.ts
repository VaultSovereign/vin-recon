import { reconstructVin, renderPortableHtml } from "@/lib/recon";
import { normalizeVin } from "@/lib/vin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      vin?: string;
      sellerClaims?: string[];
      nicbPaste?: string;
      externalPaidReportPaste?: string;
    };

    const vin = normalizeVin(body.vin ?? "");
    if (!vin || vin.length !== 17) {
      return Response.json(
        { error: "VIN must be exactly 17 characters." },
        { status: 400 },
      );
    }

    const sellerClaims = (body.sellerClaims ?? [])
      .map((claim) => claim.trim())
      .filter(Boolean);

    const report = await reconstructVin({
      vin,
      sellerClaims,
      nicbPaste: body.nicbPaste ?? "",
      externalPaidReportPaste: body.externalPaidReportPaste ?? "",
    });

    const html = renderPortableHtml(report);

    return Response.json({ report, html });
  } catch {
    return Response.json(
      { error: "Could not reconstruct VIN report." },
      { status: 500 },
    );
  }
}
