// Local-only proof ledger for the 25-real-VIN field test.
// No entry is transmitted or retained by the server. Full VINs are not stored.
import { ReconstructResponse, RiskFlagLevel, SourceCoverageState } from "../types";

export const FIELD_TEST_TARGET = 25;
export const FIELD_TEST_STORAGE_KEY = "vin-recon-field-test-v1";

export type FieldTestDecision =
  | "NOT_RECORDED"
  | "PROCEED"
  | "INVESTIGATE"
  | "REJECT"
  | "NO_DECISION";

export type FieldTestUsefulness = "NOT_RECORDED" | "YES" | "NO" | "UNSURE";

export interface FieldTestEntry {
  id: string;
  vinFingerprint: string;
  vinMasked: string;
  runAt: string;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  durationMs: number;
  completeness: ReconstructResponse["evidenceCoverage"]["completeness"];
  riskLevel: RiskFlagLevel;
  sourceStates: Record<string, SourceCoverageState>;
  findingCount: number;
  decision: FieldTestDecision;
  decisionRelevant: boolean;
  useful: FieldTestUsefulness;
  returnUse: boolean;
  note: string;
}

function maskVin(vin: string): string {
  return `${vin.slice(0, 3)}••••••••••${vin.slice(-4)}`;
}

async function fingerprintVin(vin: string): Promise<string> {
  const bytes = new TextEncoder().encode(vin.trim().toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildFieldTestEntry(report: ReconstructResponse): Promise<FieldTestEntry> {
  const vinFingerprint = await fingerprintVin(report.vin);
  return {
    id: `${report.queryTimeUtc}-${vinFingerprint}`,
    vinFingerprint,
    vinMasked: maskVin(report.vin),
    runAt: report.queryTimeUtc,
    make: report.identity.make,
    model: report.identity.model,
    modelYear: report.identity.modelYear,
    durationMs: report.diagnostics.totalDurationMs,
    completeness: report.evidenceCoverage.completeness,
    riskLevel: report.riskLevel,
    sourceStates: Object.fromEntries(
      report.evidenceCoverage.sources.map((source) => [source.sourceId, source.state])
    ),
    findingCount: report.findings.length + report.paidReports.length,
    decision: "NOT_RECORDED",
    decisionRelevant: false,
    useful: "NOT_RECORDED",
    returnUse: false,
    note: "",
  };
}

export function normalizeFieldTestEntries(raw: unknown): FieldTestEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: FieldTestEntry[] = [];
  for (const value of raw.slice(0, 250)) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Partial<FieldTestEntry>;
    if (!candidate.id || !candidate.vinFingerprint || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    entries.push({
      id: String(candidate.id).slice(0, 160),
      vinFingerprint: String(candidate.vinFingerprint).slice(0, 32),
      vinMasked: String(candidate.vinMasked ?? "masked").slice(0, 32),
      runAt: String(candidate.runAt ?? ""),
      make: candidate.make ? String(candidate.make).slice(0, 100) : null,
      model: candidate.model ? String(candidate.model).slice(0, 100) : null,
      modelYear: candidate.modelYear ? String(candidate.modelYear).slice(0, 8) : null,
      durationMs: Number.isFinite(candidate.durationMs) ? Math.max(0, Number(candidate.durationMs)) : 0,
      completeness:
        candidate.completeness === "COMPLETE" ||
        candidate.completeness === "PARTIAL" ||
        candidate.completeness === "INSUFFICIENT"
          ? candidate.completeness
          : "INSUFFICIENT",
      riskLevel:
        candidate.riskLevel === "GREEN" || candidate.riskLevel === "AMBER" || candidate.riskLevel === "RED"
          ? candidate.riskLevel
          : "AMBER",
      sourceStates:
        candidate.sourceStates && typeof candidate.sourceStates === "object"
          ? (candidate.sourceStates as Record<string, SourceCoverageState>)
          : {},
      findingCount: Number.isFinite(candidate.findingCount) ? Math.max(0, Number(candidate.findingCount)) : 0,
      decision:
        candidate.decision === "PROCEED" ||
        candidate.decision === "INVESTIGATE" ||
        candidate.decision === "REJECT" ||
        candidate.decision === "NO_DECISION"
          ? candidate.decision
          : "NOT_RECORDED",
      decisionRelevant: Boolean(candidate.decisionRelevant),
      useful:
        candidate.useful === "YES" || candidate.useful === "NO" || candidate.useful === "UNSURE"
          ? candidate.useful
          : "NOT_RECORDED",
      returnUse: Boolean(candidate.returnUse),
      note: String(candidate.note ?? "").slice(0, 1000),
    });
  }
  return entries;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function fieldTestEntriesToCsv(entries: FieldTestEntry[]): string {
  const header = [
    "run_at",
    "vin_fingerprint",
    "vin_masked",
    "year",
    "make",
    "model",
    "duration_ms",
    "completeness",
    "risk",
    "decision",
    "decision_relevant",
    "useful",
    "return_use",
    "finding_count",
    "source_states",
    "note",
  ];
  const rows = entries.map((entry) =>
    [
      entry.runAt,
      entry.vinFingerprint,
      entry.vinMasked,
      entry.modelYear,
      entry.make,
      entry.model,
      entry.durationMs,
      entry.completeness,
      entry.riskLevel,
      entry.decision,
      entry.decisionRelevant,
      entry.useful,
      entry.returnUse,
      entry.findingCount,
      JSON.stringify(entry.sourceStates),
      entry.note,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.map(csvCell).join(","), ...rows].join("\n");
}
