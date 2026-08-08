// Core normalized evidence model and shared types for VIN Recon.
//
// EVIDENCE CATEGORIES (must stay visually/structurally distinct in the UI):
//   FACT         - directly retrieved from a source (e.g. NHTSA decode, a listing page)
//   INFERENCE    - derived by combining facts (e.g. "mileage decreased between two dates")
//   SELLER_CLAIM - a claim entered by the user, not independently verified
//   UNKNOWN      - explicitly not established by any evidence
//
// COVERAGE vs RISK (v0.1.2):
//   evidenceCoverage describes whether sources actually ran.
//   riskLevel / riskFlags describe what adverse evidence was found.
//   GREEN is only allowed when required automatic sources succeeded AND no adverse evidence exists.

export type EvidenceCategory = "FACT" | "INFERENCE" | "SELLER_CLAIM" | "UNKNOWN";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type MileageUnit = "mi" | "km";

/** Core normalized record, one per piece of evidence retrieved from a source. */
export interface NormalizedRecord {
  vin: string;
  source: string;
  source_url: string | null;
  retrieved_at: string; // ISO 8601 UTC
  event_date: string | null; // ISO date (YYYY-MM-DD) if known, else null - never invented
  event_type: string;
  mileage: number | null;
  mileage_unit: MileageUnit | null;
  location: string | null;
  title_status: string | null;
  damage: string | null;
  raw_excerpt: string | null;
  evidence_type: EvidenceCategory;
  confidence: Confidence;
}

export interface VinCheckDigitResult {
  valid: boolean;
  computedCheckDigit: string | null;
  suppliedCheckDigit: string | null;
  reason: string;
  /**
   * When the supplied check digit does not match (or common single-position
   * typos are plausible), candidate 17-char VINs the user may have meant.
   * Never invents a "correct" history — only identity-form candidates.
   */
  candidates: string[];
}

/**
 * Whether factory/identity decode established a usable vehicle identity.
 * Independent of history risk and of source coverage.
 */
export type IdentityStatus =
  | "ESTABLISHED" // make + model + model year present
  | "PARTIAL" // some identity fields, but missing make/model/year
  | "UNRESOLVED" // decode empty/failed — identity not established
  | "CHECK_DIGIT_MISMATCH"; // well-formed VIN but SAE J853 check digit fails (may still decode)

export interface VehicleIdentity {
  vin: string;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  engine: string | null;
  drivetrain: string | null;
  body: string | null;
  manufacturer: string | null;
  plantCountry: string | null;
  plantCity: string | null;
  plantCompany: string | null;
  checkDigit: VinCheckDigitResult;
  identityStatus: IdentityStatus;
  identityStatusDetail: string;
}

export interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  reportReceivedDate: string | null;
  sourceUrl: string;
}

export interface TimelineEntry {
  date: string | null;
  source: string;
  location: string | null;
  mileage: number | null;
  mileageUnit: MileageUnit | null;
  event: string;
  evidenceUrl: string | null;
  confidence: Confidence;
}

export type RiskFlagLevel = "GREEN" | "AMBER" | "RED";

export interface RiskFlag {
  id: string;
  level: RiskFlagLevel;
  title: string;
  detail: string;
  supportingRecordIndexes: number[];
}

export type ClaimVerdict = "SUPPORTED" | "CONTRADICTED" | "NOT_ESTABLISHED";

export interface SellerClaimResult {
  claim: string;
  verdict: ClaimVerdict;
  evidence: string;
  source: string | null;
}

/**
 * Per-adapter coverage state.
 * SEARCH_LEADS_GENERATED is distinct from SUCCESS: public web was not searched
 * automatically; only human-openable leads were produced.
 */
export type SourceCoverageState =
  | "SUCCESS"
  | "FAILED"
  | "NOT_RUN"
  | "NOT_PROVIDED"
  | "PARTIAL"
  | "SEARCH_LEADS_GENERATED";

export type ReportCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";

export interface SourceCoverageEntry {
  sourceId: string;
  label: string;
  state: SourceCoverageState;
  /** Required automatic sources must succeed for GREEN eligibility. */
  required: boolean;
  detail: string | null;
  error: string | null;
}

export interface EvidenceCoverage {
  completeness: ReportCompleteness;
  /**
   * True only when every required automatic source is SUCCESS.
   * GREEN risk is gated on this flag.
   */
  greenEligible: boolean;
  summary: string;
  sources: SourceCoverageEntry[];
}

export interface NicbImportInput {
  rawText: string;
}

export interface NicbParsedResult {
  vin: string | null;
  titleBrandCheck: string | null;
  theftCheck: string | null;
  raw: string;
  parsedAt: string;
}

export interface ReconstructRequest {
  vin: string;
  nicbRawText?: string;
  sellerClaims?: string[];
}

export interface ReconstructResponse {
  vin: string;
  queryTimeUtc: string;
  identity: VehicleIdentity;
  /** Top-level worst risk among flags (RED > AMBER > GREEN). Kept separate from coverage. */
  riskLevel: RiskFlagLevel;
  evidenceCoverage: EvidenceCoverage;
  recalls: Recall[];
  records: NormalizedRecord[];
  timeline: TimelineEntry[];
  riskFlags: RiskFlag[];
  claimResults: SellerClaimResult[];
  purchaseQuestions: string[];
  sourcesQueried: string[];
  parserVersion: string;
}
