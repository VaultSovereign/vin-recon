// Evidence coverage matrix and completeness rules (v0.1.2).
//
// Coverage describes whether sources actually ran. It is separate from risk.
// GREEN is only possible when greenEligible is true (all required auto sources SUCCESS).
import {
  EvidenceCoverage,
  ReportCompleteness,
  SourceCoverageEntry,
  SourceCoverageState,
} from "../types";

export interface AdapterCoverageInput {
  vpic: { error: string | null; hasCoreIdentity: boolean };
  recalls: {
    error: string | null;
    skipped: boolean;
    state?: SourceCoverageState;
    detail?: string | null;
  };
  publicSearch: { leadCount: number };
  /** User-attested web/auction observations (addon or UI). */
  userFindings: { count: number };
  nicb: { provided: boolean; recordCount: number; error?: string | null };
  paidReport: { provided: boolean; recordCount?: number; error?: string | null };
  vinRecall?: { status: string };
  governmentContext?: {
    complaintsState: SourceCoverageState;
    complaintsDetail: string;
    complaintsError: string | null;
    investigationsState: SourceCoverageState;
    manufacturerCommunicationsState: SourceCoverageState;
  };
}

export function buildEvidenceCoverage(input: AdapterCoverageInput): EvidenceCoverage {
  const sources: SourceCoverageEntry[] = [];

  // --- NHTSA vPIC (required automatic) ---
  let vpicState: SourceCoverageState;
  let vpicDetail: string | null;
  if (input.vpic.error) {
    vpicState = "FAILED";
    vpicDetail = input.vpic.error;
  } else if (input.vpic.hasCoreIdentity) {
    vpicState = "SUCCESS";
    vpicDetail = "Make/model/year decoded.";
  } else {
    vpicState = "PARTIAL";
    vpicDetail = "vPIC responded but did not return a complete core identity.";
  }
  sources.push({
    sourceId: "nhtsa_vpic",
    label: "NHTSA vPIC",
    state: vpicState,
    required: true,
    detail: vpicDetail,
    error: input.vpic.error,
  });

  // --- NHTSA recalls (required automatic when identity allows; FAILED if error) ---
  let recallsState: SourceCoverageState;
  let recallsDetail: string | null;
  if (input.recalls.state) {
    recallsState = input.recalls.state;
    recallsDetail = input.recalls.detail ?? input.recalls.error;
  } else if (input.recalls.skipped) {
    // Could not run because identity incomplete — treat as NOT_RUN (not a silent success).
    recallsState = "NOT_RUN";
    recallsDetail = "Skipped — insufficient make/model/year to query recalls.";
  } else if (input.recalls.error) {
    recallsState = "FAILED";
    recallsDetail = input.recalls.error;
  } else {
    recallsState = "SUCCESS";
    recallsDetail = "Recall lookup completed.";
  }
  sources.push({
    sourceId: "nhtsa_recalls",
    label: "NHTSA Recalls",
    state: recallsState,
    required: true,
    detail: recallsDetail,
    error: input.recalls.error,
  });

  // --- VIN-specific recall page (manual observation; never scraped) ---
  const vinRecallStatus = input.vinRecall?.status ?? "NOT_CHECKED";
  sources.push({
    sourceId: "nhtsa_vin_recall",
    label: "NHTSA VIN-specific recall check",
    state:
      vinRecallStatus === "NOT_CHECKED"
        ? "NOT_PROVIDED"
        : vinRecallStatus === "RESULT_UNAVAILABLE"
          ? "PARTIAL"
          : "SUCCESS",
    required: false,
    detail:
      vinRecallStatus === "NOT_CHECKED"
        ? "Not checked — open the official NHTSA VIN lookup and record the observed result."
        : `Investigator-recorded result: ${vinRecallStatus}. VIN Recon did not scrape the page.`,
    error: null,
  });

  // --- Public web: leads only (never SEARCH_COMPLETED) ---
  sources.push({
    sourceId: "public_search",
    label: "Public web / auction search",
    state: "SEARCH_LEADS_GENERATED",
    required: false,
    detail: `${input.publicSearch.leadCount} search-pack lead(s) generated. No pages were fetched or scraped.`,
    error: null,
  });

  // --- User-recorded source observations (optional; from UI or browser addon) ---
  sources.push({
    sourceId: "user_findings",
    label: "User-recorded source observations",
    state: input.userFindings.count > 0 ? "SUCCESS" : "NOT_PROVIDED",
    required: false,
    detail:
      input.userFindings.count > 0
        ? `${input.userFindings.count} source observation(s) saved by the user (OBSERVATION records).`
        : "Not provided — open the search pack / addon and record what you observed in the source.",
    error: null,
  });

  // --- NICB manual import (optional) ---
  sources.push({
    sourceId: "nicb",
    label: "NICB VINCheck",
    state: input.nicb.provided
      ? input.nicb.error || input.nicb.recordCount === 0
        ? "PARTIAL"
        : "SUCCESS"
      : "NOT_PROVIDED",
    required: false,
    detail: input.nicb.provided
      ? input.nicb.error ?? `User-supplied paste parsed into ${input.nicb.recordCount} record(s).`
      : "Not provided — paste a manually-run VINCheck result to include.",
    error: input.nicb.error ?? null,
  });

  if (input.governmentContext) {
    sources.push({
      sourceId: "nhtsa_complaints",
      label: "NHTSA model-level complaints",
      state: input.governmentContext.complaintsState,
      required: false,
      detail: input.governmentContext.complaintsDetail,
      error: input.governmentContext.complaintsError,
    });
    sources.push({
      sourceId: "nhtsa_investigations",
      label: "NHTSA model-level investigations",
      state: input.governmentContext.investigationsState,
      required: false,
      detail: "Official model-level context link generated; no investigation page was scraped.",
      error: null,
    });
    sources.push({
      sourceId: "nhtsa_manufacturer_communications",
      label: "NHTSA manufacturer communications / TSBs",
      state: input.governmentContext.manufacturerCommunicationsState,
      required: false,
      detail: "Official model-level context link generated; no communication document was scraped.",
      error: null,
    });
  }

  // --- Paid reports (optional, never scraped) ---
  sources.push({
    sourceId: "paid_report",
    label: "NMVTIS / CARFAX / AutoCheck",
    state: input.paidReport.provided
      ? input.paidReport.error
        ? "PARTIAL"
        : (input.paidReport.recordCount ?? 0) > 0
          ? "SUCCESS"
          : "PARTIAL"
      : "NOT_PROVIDED",
    required: false,
    detail: input.paidReport.provided
      ? `User-supplied paid report transcribed into ${input.paidReport.recordCount ?? 0} observation record(s).`
      : "Not provided — paid reports are never scraped; import is optional.",
    error: input.paidReport.error ?? null,
  });

  const required = sources.filter((s) => s.required);
  const requiredSuccess = required.filter((s) => s.state === "SUCCESS");
  const requiredFailedOrNotRun = required.filter(
    (s) => s.state === "FAILED" || s.state === "NOT_RUN" || s.state === "PARTIAL"
  );

  const greenEligible = required.every((s) => s.state === "SUCCESS");

  let completeness: ReportCompleteness;
  if (greenEligible) {
    completeness = "COMPLETE";
  } else if (requiredSuccess.length === 0) {
    completeness = "INSUFFICIENT";
  } else {
    completeness = "PARTIAL";
  }

  const matrix = sources.map((s) => `${s.label}: ${s.state}`).join("; ");
  let summary: string;
  if (completeness === "COMPLETE") {
    summary =
      "Required automatic sources completed successfully. " +
      "Optional sources may still be NOT_PROVIDED. " +
      matrix;
  } else if (completeness === "PARTIAL") {
    summary =
      "Search incomplete — no conclusion about adverse history. " +
      `Required sources not fully successful (${requiredFailedOrNotRun.map((s) => s.sourceId).join(", ") || "unknown"}). ` +
      matrix;
  } else {
    summary =
      "Search insufficient — required automatic sources did not succeed. " +
      "No conclusion about adverse history is warranted. " +
      matrix;
  }

  return { completeness, greenEligible, summary, sources };
}

/** Format coverage as a compact matrix line for banners. */
export function formatCoverageMatrix(coverage: EvidenceCoverage): string {
  return coverage.sources.map((s) => `${s.label}: ${s.state}`).join(" · ");
}
