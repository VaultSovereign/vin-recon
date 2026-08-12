// Manual handoff for NHTSA's VIN-specific recall checker.
// The page is opened by the investigator; VIN Recon never scrapes it.
import {
  NormalizedRecord,
  VinRecallVerification,
  VinRecallVerificationInput,
  VinRecallVerificationStatus,
} from "../types";

const ALLOWED_STATUSES = new Set<VinRecallVerificationStatus>([
  "NOT_CHECKED",
  "NO_OPEN_RECALLS_OBSERVED",
  "OPEN_RECALLS_OBSERVED",
  "RESULT_UNAVAILABLE",
]);

function cleanDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildNhtsaVinRecallUrl(vin: string): string {
  return `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`;
}

export function normalizeVinRecallVerification(
  vin: string,
  input?: VinRecallVerificationInput
): { verification: VinRecallVerification; record: NormalizedRecord | null } {
  const sourceUrl = buildNhtsaVinRecallUrl(vin);
  const requestedStatus = input?.status ?? "NOT_CHECKED";
  const status = ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : "NOT_CHECKED";
  const checkedAt = status === "NOT_CHECKED" ? null : cleanDate(input?.checkedAt) ?? new Date().toISOString();
  const note = input?.note?.trim().slice(0, 2000) || null;

  const verification: VinRecallVerification = {
    status,
    sourceUrl,
    checkedAt,
    note,
    evidenceRecordIndex: null,
  };

  if (status === "NOT_CHECKED") return { verification, record: null };

  const statusText: Record<Exclude<VinRecallVerificationStatus, "NOT_CHECKED">, string> = {
    NO_OPEN_RECALLS_OBSERVED: "Investigator reports that the NHTSA VIN lookup displayed no open recalls.",
    OPEN_RECALLS_OBSERVED: "Investigator reports that the NHTSA VIN lookup displayed one or more open recalls.",
    RESULT_UNAVAILABLE: "Investigator could not obtain a usable result from the NHTSA VIN lookup.",
  };

  return {
    verification,
    record: {
      vin,
      source: "NHTSA VIN recall check (user-observed)",
      source_url: sourceUrl,
      retrieved_at: checkedAt!,
      event_date: null,
      event_type: `vin_recall_${status.toLowerCase()}`,
      mileage: null,
      mileage_unit: null,
      location: null,
      title_status: null,
      damage: null,
      raw_excerpt: [statusText[status], note].filter(Boolean).join(" "),
      evidence_type: status === "RESULT_UNAVAILABLE" ? "UNKNOWN" : "OBSERVATION",
      confidence: status === "RESULT_UNAVAILABLE" ? "LOW" : "MEDIUM",
      provenance: {
        kind: "USER_OBSERVED_SOURCE",
        origin: "NHTSA VIN recall lookup",
        independenceKey: "nhtsa-vin-recall",
        relationship: "ORIGINAL",
        independentlyRetrieved: false,
        note: "Result was recorded by the investigator; VIN Recon did not retrieve or scrape the page.",
      },
    },
  };
}
