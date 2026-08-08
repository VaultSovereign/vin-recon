/**
 * Regression tests for v0.1.2 evidence-coverage and GREEN gating.
 * Run: npx tsx src/lib/engine/coverageRules.test.ts
 */
import { buildEvidenceCoverage } from "./evidenceCoverage";
import { computeRiskFlags, worstRiskLevel } from "./riskFlags";
import { deriveIdentityStatus } from "./identityStatus";
import { suggestCheckDigitCandidates, validateVinCheckDigit, computeCheckDigit } from "../vinCheckDigit";
import { NormalizedRecord, TimelineEntry } from "../types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL ${msg}`);
  }
}

function baseRecord(over: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    vin: "55SWF4JB6FU077077",
    source: "test",
    source_url: null,
    retrieved_at: new Date().toISOString(),
    event_date: null,
    event_type: "vin_decode",
    mileage: null,
    mileage_unit: null,
    location: null,
    title_status: null,
    damage: null,
    raw_excerpt: null,
    evidence_type: "FACT",
    confidence: "HIGH",
    ...over,
  };
}

console.log("1) all required sources SUCCESS + no adverse => GREEN eligible + GREEN flag");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: null, hasCoreIdentity: true },
    recalls: { error: null, skipped: false },
    publicSearch: { leadCount: 7 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
  assert(coverage.greenEligible === true, "greenEligible true");
  assert(coverage.completeness === "COMPLETE", "completeness COMPLETE");
  assert(coverage.sources.find((s) => s.sourceId === "nicb")?.state === "NOT_PROVIDED", "NICB NOT_PROVIDED");
  assert(
    coverage.sources.find((s) => s.sourceId === "public_search")?.state === "SEARCH_LEADS_GENERATED",
    "public search SEARCH_LEADS_GENERATED"
  );

  const flags = computeRiskFlags([baseRecord()], [], coverage);
  assert(flags.some((f) => f.id === "no-adverse-evidence" && f.level === "GREEN"), "GREEN no-adverse flag present");
  assert(!flags.some((f) => f.id === "incomplete-search"), "no incomplete-search flag");
  assert(worstRiskLevel(flags) === "GREEN", "worst risk GREEN");
}

console.log("2) NHTSA vPIC unavailable => AMBER / PARTIAL or INSUFFICIENT, never GREEN");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: "network down", hasCoreIdentity: false },
    recalls: { error: null, skipped: true },
    publicSearch: { leadCount: 7 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
  assert(coverage.greenEligible === false, "not greenEligible");
  assert(coverage.completeness === "INSUFFICIENT", "INSUFFICIENT when no required SUCCESS");
  assert(coverage.sources.find((s) => s.sourceId === "nhtsa_vpic")?.state === "FAILED", "vPIC FAILED");
  assert(coverage.sources.find((s) => s.sourceId === "nhtsa_recalls")?.state === "NOT_RUN", "recalls NOT_RUN");

  const flags = computeRiskFlags(
    [baseRecord({ evidence_type: "UNKNOWN", event_type: "vin_decode_error" })],
    [],
    coverage
  );
  assert(flags.some((f) => f.id === "incomplete-search" && f.level === "AMBER"), "incomplete-search AMBER");
  assert(!flags.some((f) => f.level === "GREEN"), "no GREEN when incomplete");
  assert(worstRiskLevel(flags) === "AMBER", "worst risk AMBER");
}

console.log("3) NICB not provided is explicit in matrix");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: null, hasCoreIdentity: true },
    recalls: { error: null, skipped: false },
    publicSearch: { leadCount: 7 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
  assert(coverage.sources.find((s) => s.sourceId === "nicb")?.state === "NOT_PROVIDED", "NICB NOT_PROVIDED");
  assert(coverage.sources.find((s) => s.sourceId === "paid_report")?.state === "NOT_PROVIDED", "paid NOT_PROVIDED");
  assert(coverage.sources.find((s) => s.sourceId === "user_findings")?.state === "NOT_PROVIDED", "findings NOT_PROVIDED");
}

console.log("4) affirmative salvage evidence => RED regardless of other source failures");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: "down", hasCoreIdentity: false },
    recalls: { error: null, skipped: true },
    publicSearch: { leadCount: 0 },
    userFindings: { count: 1 },
    nicb: { provided: true, recordCount: 1 },
    paidReport: { provided: false },
  });
  const records = [
    baseRecord({
      evidence_type: "FACT",
      title_status: "salvage title",
      raw_excerpt: "Vehicle has salvage brand",
    }),
  ];
  const flags = computeRiskFlags(records, [], coverage);
  assert(flags.some((f) => f.id === "adverse-salvage" && f.level === "RED"), "salvage RED");
  assert(!flags.some((f) => f.level === "GREEN"), "no GREEN with RED salvage");
  assert(worstRiskLevel(flags) === "RED", "worst risk RED");
}

console.log("5) zero FACT records must never imply clean history");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: null, hasCoreIdentity: true },
    recalls: { error: null, skipped: false },
    publicSearch: { leadCount: 7 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
  const records = [baseRecord({ evidence_type: "UNKNOWN", event_type: "search_leads_generated" })];
  const flags = computeRiskFlags(records, [] as TimelineEntry[], coverage);
  assert(flags.some((f) => f.id === "zero-fact-records"), "zero-fact-records flag");
  assert(!flags.some((f) => f.level === "GREEN"), "zero FACT records never emit GREEN");
  assert(worstRiskLevel(flags) === "AMBER", "worst risk AMBER when zero facts");
}

console.log("6) check-digit candidates + identity status");
{
  // Constructed VIN with a correct SAE J853 check digit (position 9).
  const good = "1HGCM82667A004352";
  const goodResult = validateVinCheckDigit(good);
  assert(goodResult.valid === true, "known VIN check digit valid");
  assert(goodResult.candidates.length === 0, "no candidates when valid");

  const bad = good.slice(0, 8) + "0" + good.slice(9); // wrong check digit
  const badResult = validateVinCheckDigit(bad);
  assert(badResult.valid === false, "bad check digit invalid");
  assert(badResult.candidates.length > 0, "candidates suggested");
  assert(
    badResult.candidates.includes(good) || badResult.candidates[0][8] === computeCheckDigit(bad),
    "corrected form present"
  );

  const candidates = suggestCheckDigitCandidates(bad);
  assert(candidates.length > 0, "suggestCheckDigitCandidates non-empty");

  const established = deriveIdentityStatus({
    make: "HONDA",
    model: "Accord",
    modelYear: "2007",
    checkDigit: goodResult,
    decodeError: null,
  });
  assert(established.identityStatus === "ESTABLISHED", "ESTABLISHED when core + valid check");

  const mismatch = deriveIdentityStatus({
    make: "HONDA",
    model: "Accord",
    modelYear: "2007",
    checkDigit: badResult,
    decodeError: null,
  });
  assert(mismatch.identityStatus === "CHECK_DIGIT_MISMATCH", "CHECK_DIGIT_MISMATCH");

  const unresolved = deriveIdentityStatus({
    make: null,
    model: null,
    modelYear: null,
    checkDigit: goodResult,
    decodeError: "network",
  });
  assert(unresolved.identityStatus === "UNRESOLVED", "UNRESOLVED");
}

console.log("7) partial required success => PARTIAL completeness, no GREEN");
{
  const coverage = buildEvidenceCoverage({
    vpic: { error: null, hasCoreIdentity: true },
    recalls: { error: "HTTP 500", skipped: false },
    publicSearch: { leadCount: 7 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
  assert(coverage.completeness === "PARTIAL", "PARTIAL");
  assert(coverage.greenEligible === false, "not greenEligible");
  const flags = computeRiskFlags([baseRecord()], [], coverage);
  assert(!flags.some((f) => f.level === "GREEN"), "no GREEN on PARTIAL coverage");
  assert(coverage.summary.includes("Search incomplete"), "summary says search incomplete");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
