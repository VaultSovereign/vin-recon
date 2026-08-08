// Orchestrates all adapters and engine steps into a single reconstruction response.
import { NormalizedRecord, ReconstructRequest, ReconstructResponse } from "../types";
import { isWellFormedVin } from "../vinCheckDigit";
import { decodeVinWithVpic } from "../adapters/nhtsaVpic";
import { fetchRecallsForVehicle } from "../adapters/nhtsaRecalls";
import { buildSearchDiscoveryRecord, buildVinSearchLeads } from "../adapters/searchDiscovery";
import { parseNicbResult, nicbResultToRecords } from "../adapters/nicbImport";
import { buildTimeline } from "./timeline";
import { computeRiskFlags } from "./riskFlags";
import { checkSellerClaims } from "./sellerClaims";
import { generatePurchaseQuestions } from "./purchaseQuestions";

export const PARSER_VERSION = "vin-recon/0.1.0";

export async function reconstruct(request: ReconstructRequest): Promise<ReconstructResponse> {
  const vin = request.vin.trim().toUpperCase();
  const queryTimeUtc = new Date().toISOString();
  const sourcesQueried: string[] = [];
  const records: NormalizedRecord[] = [];

  if (!isWellFormedVin(vin)) {
    throw new Error("VIN must be 17 characters using only valid VIN alphanumerics (no I, O, Q).");
  }

  // 1. NHTSA vPIC decode.
  const vpic = await decodeVinWithVpic(vin);
  sourcesQueried.push(vpic.sourceUrl);
  records.push(vpic.record);

  // 2. NHTSA recalls (depends on decoded make/model/year).
  const recallsOutcome = await fetchRecallsForVehicle(vin, vpic.identity.make, vpic.identity.model, vpic.identity.modelYear);
  sourcesQueried.push(recallsOutcome.sourceUrl);
  records.push(recallsOutcome.record);

  // 3. Public search discovery (generates leads only, does not scrape).
  const searchLeads = buildVinSearchLeads(vin);
  records.push(buildSearchDiscoveryRecord(vin, searchLeads));

  // 4. Optional NICB manual import.
  if (request.nicbRawText && request.nicbRawText.trim().length > 0) {
    const parsed = parseNicbResult(request.nicbRawText);
    const nicbRecords = nicbResultToRecords(vin, parsed);
    records.push(...nicbRecords);
    sourcesQueried.push("https://www.nicb.org/vincheck (user-supplied paste)");
  }

  // 5. Timeline, risk flags, seller claims, purchase questions.
  const timeline = buildTimeline(records);
  const riskFlags = computeRiskFlags(records, timeline);
  const claimResults = checkSellerClaims(request.sellerClaims ?? [], records);
  const purchaseQuestions = generatePurchaseQuestions(vpic.identity, timeline, riskFlags, claimResults);

  return {
    vin,
    queryTimeUtc,
    identity: vpic.identity,
    recalls: recallsOutcome.recalls,
    records,
    timeline,
    riskFlags,
    claimResults,
    purchaseQuestions,
    sourcesQueried,
    parserVersion: PARSER_VERSION,
  };
}

export { buildVinSearchLeads };
