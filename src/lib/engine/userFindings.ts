// Convert human-confirmed research findings into NormalizedRecord rows.
// Findings are never invented by the engine — only what the user saved.
import {
  Confidence,
  MileageUnit,
  NormalizedRecord,
  UserFinding,
  UserFindingInput,
} from "../types";
import { isWellFormedVin } from "../vinCheckDigit";

const MAX_FINDINGS = 50;
const MAX_NOTE_LEN = 4000;

export function normalizeUserFindingInput(
  vin: string,
  input: UserFindingInput,
  index: number
): UserFinding {
  const v = vin.trim().toUpperCase();
  const sourceLabel = (input.sourceLabel ?? "User research").trim().slice(0, 200) || "User research";
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_LEN);
  const sourceUrl = input.sourceUrl?.trim() ? input.sourceUrl.trim().slice(0, 2000) : null;
  const eventDate = input.eventDate?.trim() ? input.eventDate.trim().slice(0, 32) : null;
  const location = input.location?.trim() ? input.location.trim().slice(0, 200) : null;
  const titleStatus = input.titleStatus?.trim() ? input.titleStatus.trim().slice(0, 200) : null;
  const damage = input.damage?.trim() ? input.damage.trim().slice(0, 500) : null;

  let mileage: number | null = null;
  if (input.mileage !== undefined && input.mileage !== null && input.mileage !== "") {
    const n = typeof input.mileage === "number" ? input.mileage : parseInt(String(input.mileage), 10);
    if (Number.isFinite(n) && n >= 0) mileage = n;
  }
  const mileageUnit: MileageUnit | null =
    input.mileageUnit === "mi" || input.mileageUnit === "km" ? input.mileageUnit : mileage !== null ? "km" : null;

  const confidence: Confidence =
    input.confidence === "HIGH" || input.confidence === "MEDIUM" || input.confidence === "LOW"
      ? input.confidence
      : sourceUrl
        ? "MEDIUM"
        : "LOW";

  return {
    id: input.id?.trim() || `finding-${index + 1}`,
    vin: v,
    sourceLabel,
    sourceUrl,
    note,
    eventDate,
    mileage,
    mileageUnit,
    location,
    titleStatus,
    damage,
    confidence,
    savedAt: input.savedAt?.trim() || new Date().toISOString(),
    pageTitle: input.pageTitle?.trim()?.slice(0, 300) || null,
  };
}

export function parseUserFindings(vin: string, raw: unknown): UserFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_FINDINGS)
    .map((item, i) => normalizeUserFindingInput(vin, (item ?? {}) as UserFindingInput, i));
}

/** Map a confirmed finding to a FACT record (user attested they saw this evidence). */
export function findingToNormalizedRecord(finding: UserFinding): NormalizedRecord {
  const excerptParts = [
    finding.note || null,
    finding.pageTitle ? `Page: ${finding.pageTitle}` : null,
    finding.titleStatus ? `Title: ${finding.titleStatus}` : null,
    finding.damage ? `Damage: ${finding.damage}` : null,
  ].filter(Boolean);

  return {
    vin: finding.vin,
    source: `User finding: ${finding.sourceLabel}`,
    source_url: finding.sourceUrl,
    retrieved_at: finding.savedAt,
    event_date: finding.eventDate,
    event_type: "user_confirmed_finding",
    mileage: finding.mileage,
    mileage_unit: finding.mileageUnit,
    location: finding.location,
    title_status: finding.titleStatus,
    damage: finding.damage,
    raw_excerpt: excerptParts.join(" | ") || "User-confirmed research finding (no note).",
    evidence_type: "FACT",
    confidence: finding.confidence,
  };
}

export function findingsToRecords(findings: UserFinding[]): NormalizedRecord[] {
  return findings.map(findingToNormalizedRecord);
}

export function validateFindingsForVin(vin: string, findings: UserFinding[]): void {
  if (!isWellFormedVin(vin)) {
    throw new Error("VIN must be well-formed before attaching findings.");
  }
  for (const f of findings) {
    if (f.vin !== vin.trim().toUpperCase()) {
      throw new Error(`Finding ${f.id} VIN mismatch (expected ${vin}).`);
    }
  }
}
