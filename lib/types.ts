export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type RiskLevel = "GREEN" | "AMBER" | "RED";

export type ClaimStatus = "SUPPORTED" | "CONTRADICTED" | "NOT_ESTABLISHED";

export type FactCategory = "FACT" | "INFERENCE" | "SELLER_CLAIM" | "UNKNOWN";

export interface NormalizedRecord {
  vin: string;
  source: string;
  source_url: string;
  retrieved_at: string;
  event_date: string | null;
  event_type: string;
  mileage: number | null;
  mileage_unit: "mi" | "km" | null;
  location: string | null;
  title_status: string | null;
  damage: string | null;
  raw_excerpt: string;
  evidence_type: string;
  confidence: Confidence;
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
  plant: string | null;
  vinValidity: {
    isValidFormat: boolean;
    hasValidCheckDigit: boolean;
    checkDigit: string;
  };
}

export interface TimelineEvent {
  date: string | null;
  source: string;
  location: string | null;
  mileage: string | null;
  event: string;
  evidenceUrl: string;
  confidence: Confidence;
}

export interface RiskFlag {
  flag: string;
  level: RiskLevel;
  rationale: string;
  evidenceUrls: string[];
}

export interface ClaimAssessment {
  claim: string;
  status: ClaimStatus;
  evidence: string;
  source: string | null;
}

export interface ReconReport {
  query: {
    vin: string;
    queryTimeUtc: string;
  };
  vehicleIdentity: VehicleIdentity;
  technicalData: {
    nhtsaDecode: Record<string, unknown>;
    recalls: unknown[];
    safetyCampaigns: unknown[];
    manufacturerIdentifiers: Record<string, string | null>;
    engineOrTransmissionFamily: {
      engineFamily: string | null;
      transmissionStyle: string | null;
    };
    marketIndicators: {
      usMarketIndicator: string;
      euMarketIndicator: string;
    };
  };
  records: NormalizedRecord[];
  timeline: TimelineEvent[];
  riskFlags: RiskFlag[];
  sellerClaimChecks: ClaimAssessment[];
  purchaseQuestions: string[];
  disclaimers: string[];
  sourceUrls: string[];
  parserVersion: string;
  sourceAdapterVersions: Record<string, string>;
}
