// Convert investigator-recorded source observations into NormalizedRecord rows.
// Observations are never invented by the engine — only what the user saved.
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

function normalizeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const candidate = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))
    ? candidate
    : null;
}

function independenceKey(sourceUrl: string | null, sourceOrigin: string | null, sourceLabel: string): string {
  if (sourceOrigin) return `origin:${sourceOrigin.toLowerCase().replace(/\s+/g, "-")}`;
  if (sourceUrl) {
    try {
      return `host:${new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "")}`;
    } catch {
      // URL was already normalized; retain a conservative label fallback.
    }
  }
  return `label:${sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function normalizeUserFindingInput(
  vin: string,
  input: UserFindingInput,
  index: number
): UserFinding {
  const v = vin.trim().toUpperCase();
  const sourceLabel = (input.sourceLabel ?? "User research").trim().slice(0, 200) || "User research";
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_LEN);
  const sourceUrl = normalizeHttpUrl(input.sourceUrl);
  const eventDate = normalizeDate(input.eventDate);
  const location = input.location?.trim() ? input.location.trim().slice(0, 200) : null;
  const titleStatus = input.titleStatus?.trim() ? input.titleStatus.trim().slice(0, 200) : null;
  const damage = input.damage?.trim() ? input.damage.trim().slice(0, 500) : null;
  const sourceExcerpt = input.sourceExcerpt?.trim()
    ? input.sourceExcerpt.trim().slice(0, MAX_NOTE_LEN)
    : null;
  const sourceOrigin = input.sourceOrigin?.trim() ? input.sourceOrigin.trim().slice(0, 200) : null;
  const sourceRelationship =
    input.sourceRelationship === "ORIGINAL" ||
    input.sourceRelationship === "SYNDICATED" ||
    input.sourceRelationship === "UNKNOWN"
      ? input.sourceRelationship
      : "UNKNOWN";
  const eventType =
    input.eventType?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) ||
    "user_observed_source";

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
    sourceExcerpt,
    sourceOrigin,
    sourceRelationship,
    eventType,
  };
}

export function parseUserFindings(vin: string, raw: unknown): UserFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_FINDINGS)
    .map((item, i) => normalizeUserFindingInput(vin, (item ?? {}) as UserFindingInput, i));
}

/** Map an investigator-attested source observation without promoting it to an automatic FACT. */
export function findingToNormalizedRecord(finding: UserFinding): NormalizedRecord {
  const excerptParts = [
    finding.sourceExcerpt ? `Source excerpt: ${finding.sourceExcerpt}` : null,
    finding.note ? `Investigator note: ${finding.note}` : null,
    finding.pageTitle ? `Page: ${finding.pageTitle}` : null,
    finding.titleStatus ? `Title: ${finding.titleStatus}` : null,
    finding.damage ? `Damage: ${finding.damage}` : null,
  ].filter(Boolean);

  return {
    vin: finding.vin,
    source: `User observation: ${finding.sourceLabel}`,
    source_url: finding.sourceUrl,
    retrieved_at: finding.savedAt,
    event_date: finding.eventDate,
    event_type: finding.eventType,
    mileage: finding.mileage,
    mileage_unit: finding.mileageUnit,
    location: finding.location,
    title_status: finding.titleStatus,
    damage: finding.damage,
    raw_excerpt: excerptParts.join(" | ") || "User-recorded source observation (no note).",
    evidence_type: "OBSERVATION",
    confidence: finding.confidence,
    provenance: {
      kind: "USER_OBSERVED_SOURCE",
      origin: finding.sourceOrigin ?? finding.sourceLabel,
      independenceKey: independenceKey(finding.sourceUrl, finding.sourceOrigin, finding.sourceLabel),
      relationship: finding.sourceRelationship,
      independentlyRetrieved: false,
      note: "The investigator attested that the source displayed this information; VIN Recon did not retrieve it.",
    },
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
