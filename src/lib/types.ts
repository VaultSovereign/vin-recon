// Core normalized evidence model and shared types for VIN Recon.
import type { SearchPack } from "./engine/searchPack";
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

export type EvidenceCategory =
  | "FACT"
  | "OBSERVATION"
  | "INFERENCE"
  | "SELLER_CLAIM"
  | "UNKNOWN";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type MileageUnit = "mi" | "km";

/** How a record entered the report. This is separate from what the record says. */
export type EvidenceProvenanceKind =
  | "AUTOMATIC_PUBLIC_SOURCE"
  | "USER_OBSERVED_SOURCE"
  | "USER_SUPPLIED_CHECK"
  | "USER_IMPORTED_REPORT"
  | "GENERATED_LEAD"
  | "DERIVED";

export type SourceRelationship = "ORIGINAL" | "SYNDICATED" | "UNKNOWN";

export interface EvidenceProvenance {
  kind: EvidenceProvenanceKind;
  /** Publisher, public system, or underlying origin named by the investigator. */
  origin: string;
  /** Used for conservative independent-source counting. */
  independenceKey: string;
  relationship: SourceRelationship;
  /** True only when VIN Recon itself retrieved the public source response. */
  independentlyRetrieved: boolean;
  note: string | null;
}

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
  provenance: EvidenceProvenance;
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

export type CanonicalizationStatus = "EXACT" | "NORMALIZED" | "UNRESOLVED" | "NOT_RUN";

export interface RecallQueryResolution {
  status: CanonicalizationStatus;
  requested: {
    make: string | null;
    model: string | null;
    modelYear: string | null;
  };
  canonical: {
    make: string | null;
    model: string | null;
    modelYear: string | null;
  };
  detail: string;
  sourceUrls: string[];
}

export type VinRecallVerificationStatus =
  | "NOT_CHECKED"
  | "NO_OPEN_RECALLS_OBSERVED"
  | "OPEN_RECALLS_OBSERVED"
  | "RESULT_UNAVAILABLE";

export interface VinRecallVerificationInput {
  status?: VinRecallVerificationStatus;
  checkedAt?: string | null;
  note?: string;
}

export interface VinRecallVerification {
  status: VinRecallVerificationStatus;
  sourceUrl: string;
  checkedAt: string | null;
  note: string | null;
  evidenceRecordIndex: number | null;
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
  recordIndex: number;
}

export type RiskFlagLevel = "GREEN" | "AMBER" | "RED";

export interface RiskFlag {
  id: string;
  level: RiskFlagLevel;
  title: string;
  detail: string;
  supportingRecordIndexes: number[];
}

export type CorroborationStatus = "SINGLE_SOURCE" | "CORROBORATED" | "DUPLICATE_ONLY";

export interface EvidenceCluster {
  id: string;
  eventType: string;
  eventDate: string | null;
  summary: string;
  recordIndexes: number[];
  independentSourceCount: number;
  independenceKeys: string[];
  status: CorroborationStatus;
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

/**
 * Human-attested source observation (from web UI or browser addon).
 * Becomes an OBSERVATION record with explicit retrieval and independence provenance.
 */
export interface UserFindingInput {
  id?: string;
  sourceLabel?: string;
  sourceUrl?: string | null;
  note?: string;
  eventDate?: string | null;
  mileage?: number | string | null;
  mileageUnit?: MileageUnit | null;
  location?: string | null;
  titleStatus?: string | null;
  damage?: string | null;
  confidence?: Confidence;
  savedAt?: string;
  pageTitle?: string | null;
  /** Exact excerpt observed at the source, kept distinct from the investigator note. */
  sourceExcerpt?: string | null;
  /** Underlying publisher/original source when the page is a mirror or syndication. */
  sourceOrigin?: string | null;
  sourceRelationship?: SourceRelationship;
  eventType?: string | null;
}

export interface UserFinding {
  id: string;
  vin: string;
  sourceLabel: string;
  sourceUrl: string | null;
  note: string;
  eventDate: string | null;
  mileage: number | null;
  mileageUnit: MileageUnit | null;
  location: string | null;
  titleStatus: string | null;
  damage: string | null;
  confidence: Confidence;
  savedAt: string;
  pageTitle: string | null;
  sourceExcerpt: string | null;
  sourceOrigin: string | null;
  sourceRelationship: SourceRelationship;
  eventType: string;
}

export type PaidReportProviderKind = "NMVTIS_APPROVED" | "CARFAX" | "AUTOCHECK" | "OTHER";

/** Structured transcription of a report the user obtained independently. */
export interface PaidReportInput {
  id?: string;
  provider?: string;
  providerKind?: PaidReportProviderKind;
  sourceUrl?: string | null;
  reportDate?: string | null;
  purchasedAt?: string | null;
  rawText?: string;
  sourceExcerpt?: string | null;
  titleStatus?: string | null;
  damage?: string | null;
  mileage?: number | string | null;
  mileageUnit?: MileageUnit | null;
  location?: string | null;
  eventDate?: string | null;
}

export type PaidReportImportStatus = "IMPORTED" | "PARTIAL" | "VIN_MISMATCH" | "NOT_PROVIDED";

export interface PaidReportImportResult {
  id: string;
  provider: string;
  providerKind: PaidReportProviderKind;
  sourceUrl: string | null;
  reportDate: string | null;
  purchasedAt: string | null;
  status: PaidReportImportStatus;
  detectedVin: string | null;
  vinMatches: boolean | null;
  recordIndexes: number[];
  warning: string | null;
}

export type ResearchRegion = "US" | "CA" | "UK" | "EU" | "PL";

export interface NhtsaComplaint {
  odiNumber: string;
  components: string;
  summary: string;
  dateOfIncident: string | null;
  dateComplaintFiled: string | null;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
}

export interface ModelContextLead {
  label: string;
  state: SourceCoverageState;
  sourceUrl: string;
  detail: string;
}

export interface GovernmentContext {
  scope: "MODEL_LEVEL";
  vehicle: { make: string | null; model: string | null; modelYear: string | null };
  disclaimer: string;
  complaints: {
    state: SourceCoverageState;
    sourceUrl: string;
    totalCount: number | null;
    returnedCount: number;
    crashCount: number;
    fireCount: number;
    injuryCount: number;
    deathCount: number;
    topComponents: { component: string; count: number }[];
    recent: NhtsaComplaint[];
    error: string | null;
  };
  investigations: ModelContextLead;
  manufacturerCommunications: ModelContextLead;
}

export interface AdapterDiagnostic {
  sourceId: string;
  state: SourceCoverageState;
  durationMs: number;
  detail: string | null;
}

export interface ReconstructionDiagnostics {
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  adapters: AdapterDiagnostic[];
  retention: "NOT_STORED_SERVER_SIDE";
}

export interface ReconstructRequest {
  vin: string;
  nicbRawText?: string;
  sellerClaims?: string[];
  /** User-attested source observations from manual research / browser addon. */
  findings?: UserFindingInput[];
  paidReports?: PaidReportInput[];
  vinRecallVerification?: VinRecallVerificationInput;
  researchRegions?: ResearchRegion[];
}

export interface ReconstructResponse {
  vin: string;
  queryTimeUtc: string;
  identity: VehicleIdentity;
  /** Top-level worst risk among flags (RED > AMBER > GREEN). Kept separate from coverage. */
  riskLevel: RiskFlagLevel;
  evidenceCoverage: EvidenceCoverage;
  recalls: Recall[];
  recallQuery: RecallQueryResolution;
  vinRecallVerification: VinRecallVerification;
  records: NormalizedRecord[];
  timeline: TimelineEntry[];
  evidenceClusters: EvidenceCluster[];
  riskFlags: RiskFlag[];
  claimResults: SellerClaimResult[];
  purchaseQuestions: string[];
  sourcesQueried: string[];
  parserVersion: string;
  /** Echo of normalized user findings included in this reconstruction. */
  findings: UserFinding[];
  paidReports: PaidReportImportResult[];
  /** Privacy-first search pack (human-openable URLs; nothing scraped). */
  searchPack: SearchPack;
  researchRegions: ResearchRegion[];
  governmentContext: GovernmentContext;
  diagnostics: ReconstructionDiagnostics;
}
