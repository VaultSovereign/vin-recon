// Structured transcription of reports the investigator obtained independently.
// No provider is queried, no paywall is accessed, and raw reports are not retained.
import {
  MileageUnit,
  NormalizedRecord,
  PaidReportImportResult,
  PaidReportInput,
  PaidReportProviderKind,
} from "../types";

const MAX_REPORTS = 5;

function httpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

function dateOnly(value: string | null | undefined): string | null {
  const candidate = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))
    ? candidate
    : null;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function detectVin(text: string): string | null {
  return text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0].toUpperCase() ?? null;
}

function providerKind(value: PaidReportInput["providerKind"]): PaidReportProviderKind {
  return value === "NMVTIS_APPROVED" || value === "CARFAX" || value === "AUTOCHECK" || value === "OTHER"
    ? value
    : "OTHER";
}

function mileageValue(value: PaidReportInput["mileage"]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function mileageUnit(value: PaidReportInput["mileageUnit"], mileage: number | null): MileageUnit | null {
  if (value === "mi" || value === "km") return value;
  return mileage === null ? null : "mi";
}

function provenance(provider: string, kind: PaidReportProviderKind) {
  return {
    kind: "USER_IMPORTED_REPORT" as const,
    origin: provider,
    independenceKey: `paid-provider:${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    relationship: "ORIGINAL" as const,
    independentlyRetrieved: false,
    note:
      kind === "NMVTIS_APPROVED"
        ? "Structured transcription from a user-obtained report identified as an approved NMVTIS provider report."
        : "Structured transcription from a user-obtained third-party report.",
  };
}

export function importPaidReports(
  vin: string,
  rawInputs: PaidReportInput[]
): { records: NormalizedRecord[]; results: PaidReportImportResult[]; error: string | null } {
  const records: NormalizedRecord[] = [];
  const results: PaidReportImportResult[] = [];
  const errors: string[] = [];

  rawInputs.slice(0, MAX_REPORTS).forEach((input, index) => {
    const provider = input.provider?.trim().slice(0, 160) || "Unnamed paid-report provider";
    const kind = providerKind(input.providerKind);
    const sourceUrl = httpUrl(input.sourceUrl);
    const reportDate = dateOnly(input.reportDate);
    const purchasedAt = isoDate(input.purchasedAt);
    const rawText = input.rawText?.slice(0, 20000) ?? "";
    const excerpt = input.sourceExcerpt?.trim().slice(0, 4000) || null;
    const detectedVin = detectVin(`${rawText}\n${excerpt ?? ""}`);
    const vinMatches = detectedVin ? detectedVin === vin : null;
    const result: PaidReportImportResult = {
      id: input.id?.trim().slice(0, 120) || `paid-report-${index + 1}`,
      provider,
      providerKind: kind,
      sourceUrl,
      reportDate,
      purchasedAt,
      status: "IMPORTED",
      detectedVin,
      vinMatches,
      recordIndexes: [],
      warning: null,
    };

    if (vinMatches === false) {
      const recordIndex = records.length;
      records.push({
        vin,
        source: `Imported report: ${provider}`,
        source_url: sourceUrl,
        retrieved_at: purchasedAt ?? new Date().toISOString(),
        event_date: null,
        event_type: "paid_report_vin_mismatch",
        mileage: null,
        mileage_unit: null,
        location: null,
        title_status: null,
        damage: null,
        raw_excerpt: `Imported report identifies VIN ${detectedVin}; expected ${vin}. Vehicle evidence was excluded.`,
        evidence_type: "UNKNOWN",
        confidence: "LOW",
        provenance: provenance(provider, kind),
      });
      result.status = "VIN_MISMATCH";
      result.recordIndexes = [recordIndex];
      result.warning = "The detected report VIN does not match this reconstruction.";
      errors.push(`${provider}: VIN mismatch`);
      results.push(result);
      return;
    }

    const mileage = mileageValue(input.mileage);
    const unit = mileageUnit(input.mileageUnit, mileage);
    const titleStatus = input.titleStatus?.trim().slice(0, 300) || null;
    const damage = input.damage?.trim().slice(0, 500) || null;
    const location = input.location?.trim().slice(0, 200) || null;
    const eventDate = dateOnly(input.eventDate);
    const hasStructuredFinding = Boolean(excerpt || titleStatus || damage || mileage !== null || location || eventDate);

    const recordIndex = records.length;
    records.push({
      vin,
      source: `Imported report: ${provider}`,
      source_url: sourceUrl,
      retrieved_at: purchasedAt ?? new Date().toISOString(),
      event_date: eventDate,
      event_type: hasStructuredFinding ? "paid_report_observation" : "paid_report_unstructured",
      mileage,
      mileage_unit: unit,
      location,
      title_status: titleStatus,
      damage,
      raw_excerpt:
        excerpt ??
        "A report was supplied, but no source excerpt or structured finding was transcribed; no report claim was inferred.",
      evidence_type: hasStructuredFinding ? "OBSERVATION" : "UNKNOWN",
      confidence: hasStructuredFinding ? "MEDIUM" : "LOW",
      provenance: provenance(provider, kind),
    });
    result.recordIndexes = [recordIndex];

    if (!hasStructuredFinding) {
      result.status = "PARTIAL";
      result.warning = "Report supplied without a structured finding or exact source excerpt.";
      errors.push(`${provider}: no structured finding`);
    } else if (!detectedVin) {
      result.status = "PARTIAL";
      result.warning = "No VIN was detected in the supplied report text; confirm the report belongs to this vehicle.";
    }
    if (kind === "NMVTIS_APPROVED") {
      const limitation =
        "NMVTIS coverage can be incomplete and is not a substitute for an independent vehicle inspection.";
      result.warning = result.warning ? `${result.warning} ${limitation}` : limitation;
    }
    results.push(result);
  });

  return { records, results, error: errors.length > 0 ? errors.join("; ") : null };
}
