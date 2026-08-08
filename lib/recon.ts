import { decodeVinNhtsa, getVinRecalls } from "@/lib/adapters/nhtsa";
import { searchExactVinPublicRecords } from "@/lib/adapters/publicSearch";
import type {
  ClaimAssessment,
  NormalizedRecord,
  ReconReport,
  RiskFlag,
  TimelineEvent,
  VehicleIdentity,
} from "@/lib/types";
import { hasValidVinCheckDigit, isVinFormatValid } from "@/lib/vin";

interface ReconInput {
  vin: string;
  sellerClaims: string[];
  nicbPaste: string;
  externalPaidReportPaste: string;
}

function pickLocation(text: string): string | null {
  const stateMatch = text.match(/\b([A-Z][a-z]+,\s?[A-Z]{2}|[A-Z]{2})\b/);
  return stateMatch?.[1] ?? null;
}

function parseNicbManualImport(vin: string, raw: string): NormalizedRecord[] {
  if (!raw.trim()) return [];

  const now = new Date().toISOString();
  const low = raw.toLowerCase();

  return [
    {
      vin,
      source: "NICB Manual Import",
      source_url: "user-supplied://nicb",
      retrieved_at: now,
      event_date: null,
      event_type: "nicb_manual_import",
      mileage: null,
      mileage_unit: null,
      location: pickLocation(raw),
      title_status: /(salvage|flood|theft|clean title|rebuilt)/i.exec(raw)?.[1] ?? null,
      damage: /(damage|accident|collision|airbag)[^.;|]*/i.exec(raw)?.[0] ?? null,
      raw_excerpt: raw.slice(0, 1200),
      evidence_type: "manual_import",
      confidence: low.includes("vincheck") ? "HIGH" : "MEDIUM",
    },
  ];
}

function parseExternalPaidManualImport(vin: string, raw: string): NormalizedRecord[] {
  if (!raw.trim()) return [];

  return [
    {
      vin,
      source: "External Paid Report Manual Import",
      source_url: "user-supplied://paid-report",
      retrieved_at: new Date().toISOString(),
      event_date: null,
      event_type: "paid_report_manual_import",
      mileage: null,
      mileage_unit: null,
      location: pickLocation(raw),
      title_status: /(salvage|flood|theft|clean title|rebuilt)/i.exec(raw)?.[1] ?? null,
      damage: /(damage|accident|collision|airbag|structural)[^.;|]*/i.exec(raw)?.[0] ?? null,
      raw_excerpt: raw.slice(0, 1200),
      evidence_type: "manual_import",
      confidence: "MEDIUM",
    },
  ];
}

function buildTimeline(records: NormalizedRecord[]): TimelineEvent[] {
  return [...records]
    .sort((a, b) => (a.event_date ?? a.retrieved_at).localeCompare(b.event_date ?? b.retrieved_at))
    .map((record) => ({
      date: record.event_date,
      source: record.source,
      location: record.location,
      mileage:
        record.mileage && record.mileage_unit ? `${record.mileage.toLocaleString()} ${record.mileage_unit}` : null,
      event: record.damage ? `${record.event_type}: ${record.damage}` : record.event_type,
      evidenceUrl: record.source_url,
      confidence: record.confidence,
    }));
}

function makeRiskFlags(records: NormalizedRecord[], vinMismatch: boolean): RiskFlag[] {
  const flags: RiskFlag[] = [];

  const redIf = (name: string, regex: RegExp, rationale: string) => {
    const hits = records.filter((record) => regex.test(record.raw_excerpt));
    if (hits.length) {
      flags.push({
        flag: name,
        level: "RED",
        rationale,
        evidenceUrls: [...new Set(hits.map((record) => record.source_url))],
      });
    }
  };

  redIf("salvage/title indicator", /(salvage|rebuilt|title)/i, "Public evidence references title risk terms.");
  redIf("flood indicator", /flood/i, "Public evidence references flood terms.");
  redIf("theft indicator", /theft|stolen/i, "Public evidence references theft terms.");
  redIf("airbag deployment mentioned", /airbag/i, "Public evidence references airbag deployment.");
  redIf("structural damage mentioned", /structural|frame damage/i, "Public evidence references structural damage.");

  const auctionHits = records.filter((record) => /auction/i.test(record.event_type));
  if (auctionHits.length > 1) {
    flags.push({
      flag: "multiple auction appearances",
      level: "AMBER",
      rationale: "More than one auction-indexed reference was found.",
      evidenceUrls: [...new Set(auctionHits.map((record) => record.source_url))],
    });
  }

  const mileageValues = records
    .map((record) => record.mileage)
    .filter((mileage): mileage is number => mileage !== null)
    .sort((a, b) => a - b);
  if (mileageValues.length >= 2 && mileageValues[0] + 2000 < mileageValues[mileageValues.length - 1]) {
    flags.push({
      flag: "mileage inconsistency",
      level: "AMBER",
      rationale: "Mileage references vary materially across sources.",
      evidenceUrls: records.filter((record) => record.mileage !== null).map((record) => record.source_url),
    });
  }

  if (vinMismatch) {
    flags.push({
      flag: "VIN configuration mismatch",
      level: "RED",
      rationale: "VIN format or check-digit validation failed.",
      evidenceUrls: [],
    });
  }

  if (!records.length) {
    flags.push({
      flag: "unexplained chronology gap",
      level: "AMBER",
      rationale: "No dated public records were reconstructed from searched sources.",
      evidenceUrls: [],
    });
  }

  if (!flags.length) {
    flags.push({
      flag: "no adverse evidence found",
      level: "GREEN",
      rationale: "No adverse evidence found in the sources checked.",
      evidenceUrls: [],
    });
  }

  return flags;
}

function evaluateClaims(claims: string[], records: NormalizedRecord[]): ClaimAssessment[] {
  if (!claims.length) return [];

  const evidenceText = records.map((record) => `${record.raw_excerpt} ${record.title_status} ${record.damage}`).join("\n");

  return claims.map((claim) => {
    const lower = claim.toLowerCase();

    const contradictionPattern =
      lower.includes("accident free") || lower.includes("no structural")
        ? /(accident|collision|damage|structural|frame)/i
        : lower.includes("original mileage")
          ? /(rollback|inconsistent mileage|odometer discrepancy)/i
          : lower.includes("first owner")
            ? /(multiple owner|2 owner|3 owner)/i
            : lower.includes("serviced")
              ? /(no service history|not serviced)/i
              : /(contradict|inconsistent)/i;

    const supportPattern =
      lower.includes("accident free")
        ? /(accident free|no accident)/i
        : lower.includes("original mileage")
          ? /(consistent mileage|odometer consistent)/i
          : lower.includes("first owner")
            ? /(one owner|single owner|first owner)/i
            : lower.includes("serviced")
              ? /(dealer serviced|service records)/i
              : /(supported|verified)/i;

    const contradicted = contradictionPattern.exec(evidenceText);
    if (contradicted) {
      const record = records.find((entry) => entry.raw_excerpt.includes(contradicted[0])) ?? records[0];
      return {
        claim,
        status: "CONTRADICTED",
        evidence: contradicted[0],
        source: record?.source_url ?? null,
      } as ClaimAssessment;
    }

    const supported = supportPattern.exec(evidenceText);
    if (supported) {
      const record = records.find((entry) => entry.raw_excerpt.includes(supported[0])) ?? records[0];
      return {
        claim,
        status: "SUPPORTED",
        evidence: supported[0],
        source: record?.source_url ?? null,
      } as ClaimAssessment;
    }

    return {
      claim,
      status: "NOT_ESTABLISHED",
      evidence: "No direct supporting or contradicting evidence found in searched sources.",
      source: null,
    } as ClaimAssessment;
  });
}

function generateQuestions(riskFlags: RiskFlag[], claims: ClaimAssessment[]): string[] {
  const questions = new Set<string>();

  if (riskFlags.some((flag) => flag.flag.includes("auction"))) {
    questions.add("Can you provide original auction listing details, lot number, and repair photos?");
  }
  if (riskFlags.some((flag) => flag.flag.includes("mileage"))) {
    questions.add("Can you provide dated service records that reconcile all mileage references?");
  }
  if (riskFlags.some((flag) => flag.flag.includes("structural"))) {
    questions.add("Was any structural/frame repair performed, and by which shop?");
  }
  if (riskFlags.some((flag) => flag.flag.includes("salvage") || flag.flag.includes("title"))) {
    questions.add("What is the current title status, and can you share title history documentation?");
  }

  claims
    .filter((claim) => claim.status !== "SUPPORTED")
    .forEach((claim) => {
      questions.add(`Can you provide documentation supporting the claim: "${claim.claim}"?`);
    });

  questions.add("Can you share full maintenance and repair invoices for the last 3 years?");
  questions.add("Are there any known open recalls, and have they been resolved?");
  questions.add("Can you provide recent underbody and panel photos in daylight?");

  return [...questions].slice(0, 10);
}

export function renderPortableHtml(report: ReconReport): string {
  const safeJson = JSON.stringify(report, null, 2)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIN Recon ${report.query.vin}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; margin: 2rem; color: #111; }
      h1, h2 { margin-bottom: 0.5rem; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; }
      th, td { border: 1px solid #ddd; padding: 0.5rem; vertical-align: top; text-align: left; }
      code, pre { background: #f4f4f4; padding: 0.5rem; display: block; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>VIN Recon Report</h1>
    <p><strong>VIN:</strong> ${report.query.vin}</p>
    <p><strong>Query Time (UTC):</strong> ${report.query.queryTimeUtc}</p>
    <h2>Risk Flags</h2>
    <ul>${report.riskFlags.map((flag) => `<li><strong>${flag.level}</strong> — ${flag.flag}: ${flag.rationale}</li>`).join("")}</ul>
    <h2>Timeline</h2>
    <table>
      <thead><tr><th>Date</th><th>Source</th><th>Location</th><th>Mileage</th><th>Event</th><th>Evidence URL</th><th>Confidence</th></tr></thead>
      <tbody>
        ${report.timeline
          .map(
            (event) => `<tr><td>${event.date ?? "UNKNOWN"}</td><td>${event.source}</td><td>${event.location ?? "UNKNOWN"}</td><td>${event.mileage ?? "UNKNOWN"}</td><td>${event.event}</td><td><a href="${event.evidenceUrl}">${event.evidenceUrl}</a></td><td>${event.confidence}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <h2>Raw JSON</h2>
    <pre>${safeJson}</pre>
  </body>
</html>`;
}

export async function reconstructVin(input: ReconInput): Promise<ReconReport> {
  const queryTimeUtc = new Date().toISOString();
  const [decode, recalls, publicRecords] = await Promise.all([
    decodeVinNhtsa(input.vin),
    getVinRecalls(input.vin),
    searchExactVinPublicRecords(input.vin),
  ]);

  const manualRecords = [
    ...parseNicbManualImport(input.vin, input.nicbPaste),
    ...parseExternalPaidManualImport(input.vin, input.externalPaidReportPaste),
  ];
  const records = [...publicRecords, ...manualRecords];

  const vehicleIdentity: VehicleIdentity = {
    vin: input.vin,
    make: (decode?.Make as string) || null,
    model: (decode?.Model as string) || null,
    modelYear: (decode?.ModelYear as string) || null,
    engine:
      [decode?.EngineModel, decode?.EngineCylinders, decode?.FuelTypePrimary]
        .filter(Boolean)
        .join(" / ") || null,
    drivetrain: (decode?.DriveType as string) || null,
    body: (decode?.BodyClass as string) || null,
    manufacturer: (decode?.Manufacturer as string) || null,
    plantCountry: (decode?.PlantCountry as string) || null,
    plant:
      [decode?.PlantCompanyName, decode?.PlantCity]
        .filter(Boolean)
        .join(" - ") || null,
    vinValidity: {
      isValidFormat: isVinFormatValid(input.vin),
      hasValidCheckDigit: hasValidVinCheckDigit(input.vin),
      checkDigit: input.vin[8],
    },
  };

  const riskFlags = makeRiskFlags(records, !vehicleIdentity.vinValidity.hasValidCheckDigit);
  const claimChecks = evaluateClaims(input.sellerClaims, records);

  const report: ReconReport = {
    query: {
      vin: input.vin,
      queryTimeUtc,
    },
    vehicleIdentity,
    technicalData: {
      nhtsaDecode: decode ?? {},
      recalls,
      safetyCampaigns: recalls,
      manufacturerIdentifiers: {
        wmi: input.vin.slice(0, 3),
        manufacturer: vehicleIdentity.manufacturer,
        plant: vehicleIdentity.plant,
      },
      engineOrTransmissionFamily: {
        engineFamily: (decode?.EngineModel as string) || null,
        transmissionStyle: (decode?.TransmissionStyle as string) || null,
      },
      marketIndicators: {
        usMarketIndicator: /UNITED STATES|USA/i.test(String(decode?.PlantCountry ?? "")) ? "LIKELY_US" : "UNKNOWN",
        euMarketIndicator: /GERMANY|FRANCE|ITALY|SPAIN|NETHERLANDS|POLAND|EU/i.test(String(decode?.PlantCountry ?? ""))
          ? "LIKELY_EU"
          : "UNKNOWN",
      },
    },
    records,
    timeline: buildTimeline(records),
    riskFlags,
    sellerClaimChecks: claimChecks,
    purchaseQuestions: generateQuestions(riskFlags, claimChecks),
    disclaimers: [
      "Buyer due-diligence tool only; not a certification service.",
      "No adverse evidence found in the sources checked does not verify a clean history.",
      "FACT, INFERENCE, SELLER CLAIM, and UNKNOWN categories are distinct in this report.",
      "No CAPTCHA bypass, authentication bypass, or paywall circumvention is performed.",
    ],
    sourceUrls: [...new Set(records.map((record) => record.source_url))],
    parserVersion: "vin-recon-v1",
    sourceAdapterVersions: {
      nhtsa: "nhtsa-vpic-v1",
      recalls: "nhtsa-recalls-v1",
      publicSearch: "duckduckgo-index-v1",
      nicbImport: "manual-import-v1",
    },
  };

  return report;
}
