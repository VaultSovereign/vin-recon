// Core normalized evidence model and shared types for VIN Recon.
//
// EVIDENCE CATEGORIES (must stay visually/structurally distinct in the UI):
//   FACT         - directly retrieved from a source (e.g. NHTSA decode, a listing page)
//   INFERENCE    - derived by combining facts (e.g. "mileage decreased between two dates")
//   SELLER_CLAIM - a claim entered by the user, not independently verified
//   UNKNOWN      - explicitly not established by any evidence

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
}

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
  recalls: Recall[];
  records: NormalizedRecord[];
  timeline: TimelineEntry[];
  riskFlags: RiskFlag[];
  claimResults: SellerClaimResult[];
  purchaseQuestions: string[];
  sourcesQueried: string[];
  parserVersion: string;
}
