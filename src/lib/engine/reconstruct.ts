// Orchestrates all adapters and engine steps into a single reconstruction response.
//
// Hard rules (v0.1.2):
// 1. Thread adapter errors into evidenceCoverage — never discard them.
// 2. riskLevel and evidenceCoverage stay separate fields.
// 3. GREEN risk only when coverage.greenEligible and no AMBER/RED flags exist.
// 4. Identity status is explicit (ESTABLISHED | PARTIAL | UNRESOLVED | CHECK_DIGIT_MISMATCH).
//
// v0.2.0: privacy-first search pack + user-recorded source observations (addon / UI).
import {
  AdapterDiagnostic,
  NormalizedRecord,
  ReconstructRequest,
  ReconstructResponse,
  SourceCoverageState,
} from "../types";
import { isWellFormedVin } from "../vinCheckDigit";
import { decodeVinWithVpic } from "../adapters/nhtsaVpic";
import { fetchRecallsForVehicle } from "../adapters/nhtsaRecalls";
import { buildSearchDiscoveryRecord, buildVinSearchLeads } from "../adapters/searchDiscovery";
import { parseNicbResult, nicbResultToRecords } from "../adapters/nicbImport";
import { buildTimeline } from "./timeline";
import { computeRiskFlags, worstRiskLevel } from "./riskFlags";
import { checkSellerClaims } from "./sellerClaims";
import { generatePurchaseQuestions } from "./purchaseQuestions";
import { buildEvidenceCoverage } from "./evidenceCoverage";
import { applyIdentityStatus } from "./identityStatus";
import { buildSearchPack, searchPackToLeads } from "./searchPack";
import { findingsToRecords, parseUserFindings, validateFindingsForVin } from "./userFindings";
import { normalizeVinRecallVerification } from "../adapters/nhtsaVinRecallVerification";
import { importPaidReports } from "../adapters/paidReportImport";
import { fetchNhtsaGovernmentContext } from "../adapters/nhtsaGovernmentContext";
import { buildEvidenceClusters } from "./corroboration";

export const PARSER_VERSION = "vin-recon/0.2.0";

async function timed<T>(operation: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = Date.now();
  const value = await operation();
  return { value, durationMs: Date.now() - started };
}

export async function reconstruct(request: ReconstructRequest): Promise<ReconstructResponse> {
  const vin = request.vin.trim().toUpperCase();
  const startedMs = Date.now();
  const queryTimeUtc = new Date(startedMs).toISOString();
  const sourcesQueried: string[] = [];
  const records: NormalizedRecord[] = [];
  const diagnostics: AdapterDiagnostic[] = [];

  if (!isWellFormedVin(vin)) {
    throw new Error("VIN must be 17 characters using only valid VIN alphanumerics (no I, O, Q).");
  }

  const findings = parseUserFindings(vin, request.findings ?? []);
  validateFindingsForVin(vin, findings);

  // 1. NHTSA vPIC decode.
  const vpicTimed = await timed(() => decodeVinWithVpic(vin));
  const vpic = vpicTimed.value;
  sourcesQueried.push(vpic.sourceUrl);
  records.push(vpic.record);
  const identity = applyIdentityStatus(vpic.identity, vpic.error);
  const vpicState: SourceCoverageState = vpic.error
    ? "FAILED"
    : identity.make && identity.model && identity.modelYear
      ? "SUCCESS"
      : "PARTIAL";
  diagnostics.push({
    sourceId: "nhtsa_vpic",
    state: vpicState,
    durationMs: vpicTimed.durationMs,
    detail: vpic.error,
  });

  // 2. Model-level NHTSA sources run in parallel after identity decode.
  const [recallsTimed, contextTimed] = await Promise.all([
    timed(() => fetchRecallsForVehicle(vin, identity.make, identity.model, identity.modelYear)),
    timed(() => fetchNhtsaGovernmentContext(identity.make, identity.model, identity.modelYear)),
  ]);
  const recallsOutcome = recallsTimed.value;
  const governmentContext = contextTimed.value;
  sourcesQueried.push(recallsOutcome.sourceUrl);
  sourcesQueried.push(...recallsOutcome.query.sourceUrls);
  sourcesQueried.push(governmentContext.complaints.sourceUrl);
  records.push(recallsOutcome.record);
  const recallsSkipped = recallsOutcome.record.event_type === "recalls_skipped";
  diagnostics.push({
    sourceId: "nhtsa_recalls",
    state: recallsOutcome.state,
    durationMs: recallsTimed.durationMs,
    detail: recallsOutcome.error ?? recallsOutcome.query.detail,
  });
  diagnostics.push({
    sourceId: "nhtsa_complaints",
    state: governmentContext.complaints.state,
    durationMs: contextTimed.durationMs,
    detail: governmentContext.complaints.error,
  });

  // 3. Privacy-first search pack (leads only — SEARCH_LEADS_GENERATED).
  const searchPack = buildSearchPack(vin, request.researchRegions);
  const searchLeads = searchPackToLeads(searchPack);
  records.push(buildSearchDiscoveryRecord(vin, searchLeads));
  diagnostics.push({
    sourceId: "public_search",
    state: "SEARCH_LEADS_GENERATED",
    durationMs: 0,
    detail: `${searchPack.allItems.length} human-openable leads generated; no pages fetched.`,
  });

  // 4. Optional NICB manual import.
  let nicbRecordCount = 0;
  let nicbError: string | null = null;
  const nicbProvided = Boolean(request.nicbRawText && request.nicbRawText.trim().length > 0);
  if (nicbProvided) {
    const parsed = parseNicbResult(request.nicbRawText!);
    const nicbRecords = nicbResultToRecords(vin, parsed);
    nicbRecordCount = nicbRecords.length;
    if (nicbRecords.some((record) => record.event_type === "nicb_vin_mismatch")) {
      nicbError = "Pasted NICB result VIN does not match the reconstruction VIN.";
    } else if (nicbRecords.every((record) => record.evidence_type === "UNKNOWN")) {
      nicbError = "Pasted NICB result did not contain a recognized explicit result.";
    }
    records.push(...nicbRecords);
    sourcesQueried.push("https://www.nicb.org/vincheck (user-supplied paste)");
  }

  // 5. User-recorded source observations (addon / UI) → OBSERVATION records.
  if (findings.length > 0) {
    records.push(...findingsToRecords(findings));
    sourcesQueried.push("user-recorded source observations (manual / browser addon)");
  }

  // 6. Optional structured transcription of user-obtained paid reports.
  const paidProvided = Array.isArray(request.paidReports) && request.paidReports.length > 0;
  const paidImport = importPaidReports(vin, paidProvided ? request.paidReports! : []);
  const paidIndexOffset = records.length;
  records.push(...paidImport.records);
  const paidReports = paidImport.results.map((result) => ({
    ...result,
    recordIndexes: result.recordIndexes.map((index) => index + paidIndexOffset),
  }));
  if (paidProvided) sourcesQueried.push("user-obtained paid report transcription (no provider queried)");

  // 7. Optional manual result from NHTSA's VIN-specific page.
  const vinRecall = normalizeVinRecallVerification(vin, request.vinRecallVerification);
  if (vinRecall.record) {
    vinRecall.verification.evidenceRecordIndex = records.length;
    records.push(vinRecall.record);
    sourcesQueried.push(`${vinRecall.verification.sourceUrl} (user-observed; not scraped)`);
  }

  // 8. Coverage matrix (before risk — GREEN is gated on it).
  const evidenceCoverage = buildEvidenceCoverage({
    vpic: {
      error: vpic.error,
      hasCoreIdentity: Boolean(identity.make && identity.model && identity.modelYear),
    },
    recalls: {
      error: recallsOutcome.error,
      skipped: recallsSkipped,
      state: recallsOutcome.state,
      detail: recallsOutcome.error ?? recallsOutcome.query.detail,
    },
    publicSearch: { leadCount: searchPack.allItems.length },
    userFindings: { count: findings.length },
    nicb: { provided: nicbProvided, recordCount: nicbRecordCount, error: nicbError },
    paidReport: {
      provided: paidProvided,
      recordCount: paidImport.records.filter((record) => record.evidence_type === "OBSERVATION").length,
      error: paidImport.error,
    },
    vinRecall: { status: vinRecall.verification.status },
    governmentContext: {
      complaintsState: governmentContext.complaints.state,
      complaintsDetail:
        governmentContext.complaints.totalCount === null
          ? "Model-level complaint lookup did not produce a count."
          : `${governmentContext.complaints.totalCount} model-level complaint(s) returned by NHTSA.`,
      complaintsError: governmentContext.complaints.error,
      investigationsState: governmentContext.investigations.state,
      manufacturerCommunicationsState: governmentContext.manufacturerCommunications.state,
    },
  });

  // 9. Timeline, corroboration, risk flags, seller claims, purchase questions.
  const timeline = buildTimeline(records);
  const evidenceClusters = buildEvidenceClusters(records);
  const riskFlags = computeRiskFlags(records, timeline, evidenceCoverage, identity, evidenceClusters);
  const riskLevel = worstRiskLevel(riskFlags);
  const claimResults = checkSellerClaims(request.sellerClaims ?? [], records);
  const purchaseQuestions = generatePurchaseQuestions(identity, timeline, riskFlags, claimResults);
  const completedAt = new Date().toISOString();

  return {
    vin,
    queryTimeUtc,
    identity,
    riskLevel,
    evidenceCoverage,
    recalls: recallsOutcome.recalls,
    recallQuery: recallsOutcome.query,
    vinRecallVerification: vinRecall.verification,
    records,
    timeline,
    evidenceClusters,
    riskFlags,
    claimResults,
    purchaseQuestions,
    sourcesQueried,
    parserVersion: PARSER_VERSION,
    findings,
    paidReports,
    searchPack,
    researchRegions: searchPack.regions,
    governmentContext,
    diagnostics: {
      startedAt: queryTimeUtc,
      completedAt,
      totalDurationMs: Date.now() - startedMs,
      adapters: diagnostics,
      retention: "NOT_STORED_SERVER_SIDE",
    },
  };
}

export { buildVinSearchLeads };
