// Orchestrates all adapters and engine steps into a single reconstruction response.
//
// Hard rules (v0.1.2):
// 1. Thread adapter errors into evidenceCoverage — never discard them.
// 2. riskLevel and evidenceCoverage stay separate fields.
// 3. GREEN risk only when coverage.greenEligible && no RED findings.
// 4. Identity status is explicit (ESTABLISHED | PARTIAL | UNRESOLVED | CHECK_DIGIT_MISMATCH).
//
// v0.1.3: privacy-first search pack + user-confirmed findings (addon / UI).
import { NormalizedRecord, ReconstructRequest, ReconstructResponse } from "../types";
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
import { buildSearchPack } from "./searchPack";
import { findingsToRecords, parseUserFindings, validateFindingsForVin } from "./userFindings";

export const PARSER_VERSION = "vin-recon/0.1.3";

export async function reconstruct(request: ReconstructRequest): Promise<ReconstructResponse> {
  const vin = request.vin.trim().toUpperCase();
  const queryTimeUtc = new Date().toISOString();
  const sourcesQueried: string[] = [];
  const records: NormalizedRecord[] = [];

  if (!isWellFormedVin(vin)) {
    throw new Error("VIN must be 17 characters using only valid VIN alphanumerics (no I, O, Q).");
  }

  const findings = parseUserFindings(vin, request.findings ?? []);
  validateFindingsForVin(vin, findings);

  // 1. NHTSA vPIC decode.
  const vpic = await decodeVinWithVpic(vin);
  sourcesQueried.push(vpic.sourceUrl);
  records.push(vpic.record);
  const identity = applyIdentityStatus(vpic.identity, vpic.error);

  // 2. NHTSA recalls (depends on decoded make/model/year).
  const recallsOutcome = await fetchRecallsForVehicle(
    vin,
    identity.make,
    identity.model,
    identity.modelYear
  );
  sourcesQueried.push(recallsOutcome.sourceUrl);
  records.push(recallsOutcome.record);
  const recallsSkipped = recallsOutcome.record.event_type === "recalls_skipped";

  // 3. Privacy-first search pack (leads only — SEARCH_LEADS_GENERATED).
  const searchPack = buildSearchPack(vin);
  const searchLeads = buildVinSearchLeads(vin);
  records.push(buildSearchDiscoveryRecord(vin, searchLeads));

  // 4. Optional NICB manual import.
  let nicbRecordCount = 0;
  const nicbProvided = Boolean(request.nicbRawText && request.nicbRawText.trim().length > 0);
  if (nicbProvided) {
    const parsed = parseNicbResult(request.nicbRawText!);
    const nicbRecords = nicbResultToRecords(vin, parsed);
    nicbRecordCount = nicbRecords.length;
    records.push(...nicbRecords);
    sourcesQueried.push("https://www.nicb.org/vincheck (user-supplied paste)");
  }

  // 5. User-confirmed findings (addon / UI) → FACT records.
  if (findings.length > 0) {
    records.push(...findingsToRecords(findings));
    sourcesQueried.push("user-confirmed findings (manual / browser addon)");
  }

  // 6. Coverage matrix (before risk — GREEN is gated on it).
  const evidenceCoverage = buildEvidenceCoverage({
    vpic: {
      error: vpic.error,
      hasCoreIdentity: Boolean(identity.make && identity.model && identity.modelYear),
    },
    recalls: {
      error: recallsOutcome.error,
      skipped: recallsSkipped,
    },
    publicSearch: { leadCount: searchPack.allItems.length },
    userFindings: { count: findings.length },
    nicb: { provided: nicbProvided, recordCount: nicbRecordCount },
    paidReport: { provided: false },
  });

  // 7. Timeline, risk flags, seller claims, purchase questions.
  const timeline = buildTimeline(records);
  const riskFlags = computeRiskFlags(records, timeline, evidenceCoverage);
  const riskLevel = worstRiskLevel(riskFlags);
  const claimResults = checkSellerClaims(request.sellerClaims ?? [], records);
  const purchaseQuestions = generatePurchaseQuestions(identity, timeline, riskFlags, claimResults);

  return {
    vin,
    queryTimeUtc,
    identity,
    riskLevel,
    evidenceCoverage,
    recalls: recallsOutcome.recalls,
    records,
    timeline,
    riskFlags,
    claimResults,
    purchaseQuestions,
    sourcesQueried,
    parserVersion: PARSER_VERSION,
    findings,
    searchPack,
  };
}

export { buildVinSearchLeads };
