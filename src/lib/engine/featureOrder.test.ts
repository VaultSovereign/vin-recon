/** Regression tests for VIN Recon v0.2.0 feature order 0-10. */
import { fetchRecallsForVehicle } from "../adapters/nhtsaRecalls";
import { matchCanonicalProduct } from "../adapters/nhtsaProductCatalog";
import { normalizeVinRecallVerification } from "../adapters/nhtsaVinRecallVerification";
import { fetchNhtsaGovernmentContext } from "../adapters/nhtsaGovernmentContext";
import { importPaidReports } from "../adapters/paidReportImport";
import { buildEvidenceClusters } from "./corroboration";
import { buildEvidenceCoverage } from "./evidenceCoverage";
import { buildFieldTestEntry, fieldTestEntriesToCsv } from "./fieldTestLedger";
import { computeRiskFlags } from "./riskFlags";
import { buildSearchPack } from "./searchPack";
import { buildTimeline } from "./timeline";
import { findingsToRecords, parseUserFindings } from "./userFindings";
import { NormalizedRecord, ReconstructResponse, VehicleIdentity } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  OK  ${message}`);
  } else {
    failed++;
    console.error(`  FAIL ${message}`);
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function record(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    vin: "1HGCM82667A004352",
    source: "Test source",
    source_url: "https://example.com/evidence",
    retrieved_at: "2026-08-08T10:00:00.000Z",
    event_date: "2024-01-01",
    event_type: "listing_observation",
    mileage: null,
    mileage_unit: null,
    location: null,
    title_status: null,
    damage: null,
    raw_excerpt: null,
    evidence_type: "OBSERVATION",
    confidence: "MEDIUM",
    provenance: {
      kind: "USER_OBSERVED_SOURCE",
      origin: "Test source",
      independenceKey: "test-source",
      relationship: "ORIGINAL",
      independentlyRetrieved: false,
      note: null,
    },
    ...overrides,
  };
}

function completeCoverage() {
  return buildEvidenceCoverage({
    vpic: { error: null, hasCoreIdentity: true },
    recalls: { error: null, skipped: false, state: "SUCCESS" },
    publicSearch: { leadCount: 10 },
    userFindings: { count: 0 },
    nicb: { provided: false, recordCount: 0 },
    paidReport: { provided: false },
  });
}

const identity = {
  vin: "1HGCM82667A004352",
  make: "HONDA",
  model: "ACCORD",
  modelYear: "2007",
  engine: null,
  drivetrain: null,
  body: null,
  manufacturer: null,
  plantCountry: null,
  plantCity: null,
  plantCompany: null,
  checkDigit: {
    valid: true,
    computedCheckDigit: "6",
    suppliedCheckDigit: "6",
    reason: "valid",
    candidates: [],
  },
  identityStatus: "ESTABLISHED",
  identityStatusDetail: "test",
} satisfies VehicleIdentity;

async function run() {
console.log("1) canonical product matching");
assert(matchCanonicalProduct("Mercedes Benz", ["MERCEDES-BENZ", "BMW"]) === "MERCEDES-BENZ", "punctuation normalized");
assert(matchCanonicalProduct("MERCEDES-BENZ", ["MERCEDES BENZ", "MERCEDES-BENZ"]) === "MERCEDES-BENZ", "duplicate display variants resolve to exact spelling");
assert(matchCanonicalProduct("C-Class", ["C-CLASS", "E-CLASS"]) === "C-CLASS", "model punctuation normalized");
assert(matchCanonicalProduct("Class", ["C-CLASS", "E-CLASS"]) === null, "ambiguous containment rejected");

console.log("2) recall canonicalization preserves HTTP/body ambiguity as PARTIAL");
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/makes?")) return response({ results: [{ make: "MERCEDES-BENZ" }] });
    if (url.includes("/models?")) return response({ results: [{ model: "C-CLASS" }] });
    return response({ Count: 0, Message: "Results returned successfully", results: [] }, 400);
  };
  const outcome = await fetchRecallsForVehicle("55SWF4JB6FU077077", "Mercedes Benz", "C-Class", "2015");
  assert(outcome.query.status === "NORMALIZED", "query normalized against catalog");
  assert(outcome.state === "PARTIAL", "HTTP 400 readable zero result is PARTIAL");
  assert(outcome.record.event_type === "recalls_partial", "partial record explicit");
  assert(Boolean(outcome.error?.includes("ambiguous")), "ambiguity retained in error detail");
  globalThis.fetch = originalFetch;
}

console.log("3) VIN-specific recall verification is a manual observation");
{
  const result = normalizeVinRecallVerification("1HGCM82667A004352", {
    status: "OPEN_RECALLS_OBSERVED",
    checkedAt: "2026-08-08T10:00:00Z",
    note: "Campaign shown",
  });
  assert(result.record?.evidence_type === "OBSERVATION", "manual check is OBSERVATION");
  assert(result.record?.provenance.independentlyRetrieved === false, "manual check not independently retrieved");
  assert(result.verification.sourceUrl.includes("vin=1HGCM82667A004352"), "official VIN handoff URL");
}

console.log("4) user source provenance and URL handling");
{
  const findings = parseUserFindings("1HGCM82667A004352", [
    {
      sourceLabel: "Bidfax mirror",
      sourceUrl: "javascript:alert(1)",
      sourceOrigin: "Copart",
      sourceRelationship: "SYNDICATED",
      sourceExcerpt: "Front-left damage visible",
      note: "Compare with seller photos",
      eventType: "auction observation",
    },
  ]);
  const normalized = findingsToRecords(findings)[0];
  assert(findings[0].sourceUrl === null, "unsafe source URL discarded");
  assert(normalized.evidence_type === "OBSERVATION", "user material not promoted to FACT");
  assert(normalized.event_type === "auction_observation", "event type normalized");
  assert(normalized.provenance.relationship === "SYNDICATED", "syndication retained");
  assert(normalized.provenance.independenceKey === "origin:copart", "underlying origin drives independence");
}

console.log("5) paid-report transcription and VIN mismatch");
{
  const imported = importPaidReports("1HGCM82667A004352", [
    {
      provider: "Example NMVTIS provider",
      providerKind: "NMVTIS_APPROVED",
      rawText: "Report for 1HGCM82667A004352",
      sourceExcerpt: "State title brand: salvage",
      titleStatus: "salvage",
      eventDate: "2023-04-03",
    },
  ]);
  assert(imported.results[0].status === "IMPORTED", "matching structured report imported");
  assert(imported.records[0].evidence_type === "OBSERVATION", "provider statement is OBSERVATION");
  assert(imported.records[0].provenance.kind === "USER_IMPORTED_REPORT", "paid-report provenance explicit");

  const mismatch = importPaidReports("1HGCM82667A004352", [
    { provider: "Other", rawText: "Report for 2HGCM82667A004352", sourceExcerpt: "salvage" },
  ]);
  assert(mismatch.results[0].status === "VIN_MISMATCH", "mismatching report rejected");
  assert(mismatch.records[0].evidence_type === "UNKNOWN", "mismatch cannot establish vehicle evidence");
  assert(mismatch.records[0].title_status === null, "mismatch adverse field excluded");
}

console.log("6) corroboration discounts syndicated copies");
{
  const records = [
    record({ source: "Copart", damage: "front impact", provenance: { ...record().provenance, origin: "Copart", independenceKey: "copart", relationship: "ORIGINAL" } }),
    record({ source: "Bidfax", damage: "front impact", provenance: { ...record().provenance, origin: "Copart", independenceKey: "copart", relationship: "SYNDICATED" } }),
    record({ source: "Insurer notice", damage: "front impact", provenance: { ...record().provenance, origin: "Insurer", independenceKey: "insurer", relationship: "ORIGINAL" } }),
  ];
  const clusters = buildEvidenceClusters(records);
  assert(clusters.length === 1, "same event grouped");
  assert(clusters[0].independentSourceCount === 2, "mirror not counted as third source");
  assert(clusters[0].status === "CORROBORATED", "two independent origins corroborate");

  const duplicateOnly = buildEvidenceClusters(records.slice(0, 2));
  assert(duplicateOnly[0].status === "DUPLICATE_ONLY", "original plus mirror is duplicate-only");
}

console.log("7) anomaly rules are unit-aware and negation-aware");
{
  const noSalvage = record({ raw_excerpt: "No salvage or theft record was reported." });
  const noSalvageFlags = computeRiskFlags([noSalvage], buildTimeline([noSalvage]), completeCoverage(), identity, []);
  assert(!noSalvageFlags.some((flag) => flag.id === "adverse-salvage"), "negated salvage not adverse");

  const mixedUnits = [
    record({ event_date: "2023-01-01", mileage: 100000, mileage_unit: "km" }),
    record({ event_date: "2024-01-01", mileage: 63000, mileage_unit: "mi" }),
  ];
  const mixedFlags = computeRiskFlags(mixedUnits, buildTimeline(mixedUnits), completeCoverage(), identity, buildEvidenceClusters(mixedUnits));
  assert(!mixedFlags.some((flag) => flag.id.startsWith("mileage-inconsistency")), "km-to-mi increase not a rollback");

  const rollback = [
    record({ event_date: "2023-01-01", mileage: 100000, mileage_unit: "km" }),
    record({ event_date: "2024-01-01", mileage: 50000, mileage_unit: "km" }),
  ];
  const rollbackFlags = computeRiskFlags(rollback, buildTimeline(rollback), completeCoverage(), identity, buildEvidenceClusters(rollback));
  const rollbackFlag = rollbackFlags.find((flag) => flag.id.startsWith("mileage-inconsistency"));
  assert(Boolean(rollbackFlag), "actual mileage rollback flagged");
  assert(rollbackFlag?.supportingRecordIndexes.length === 2, "rollback points to both records");
}

console.log("8) model-level complaint context aggregates without becoming VIN history");
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    response({
      count: 2,
      results: [
        { odiNumber: 2, components: "ENGINE,POWER TRAIN", summary: "Reported issue", crash: true, fire: false, numberOfInjuries: 1, numberOfDeaths: 0, dateComplaintFiled: "08/01/2026" },
        { odiNumber: 1, components: "ENGINE", summary: "Another report", crash: false, fire: true, numberOfInjuries: 0, numberOfDeaths: 0, dateComplaintFiled: "07/01/2026" },
      ],
    });
  const context = await fetchNhtsaGovernmentContext("HONDA", "ACCORD", "2007");
  assert(context.scope === "MODEL_LEVEL", "context scope explicit");
  assert(context.complaints.totalCount === 2, "complaint count aggregated");
  assert(context.complaints.topComponents[0].component === "ENGINE", "top component counted");
  assert(context.complaints.crashCount === 1 && context.complaints.fireCount === 1, "indicator counts aggregated");
  globalThis.fetch = originalFetch;
}

console.log("8b) model recall campaigns require VIN-specific remedy verification");
{
  const modelRecall = record({
    event_date: null,
    event_type: "recalls_lookup",
    raw_excerpt: "10 recall campaign(s) returned for model-level query 2007 HONDA ACCORD.",
    evidence_type: "FACT",
  });
  const needsCheck = computeRiskFlags([modelRecall], [], completeCoverage(), identity, []);
  assert(needsCheck.some((flag) => flag.id === "model-recalls-require-vin-check"), "model campaigns create AMBER handoff");
  assert(!needsCheck.some((flag) => flag.level === "GREEN"), "AMBER handoff suppresses reassuring GREEN flag");
  const noOpen = record({
    event_date: null,
    event_type: "vin_recall_no_open_recalls_observed",
    raw_excerpt: "No open recalls observed.",
  });
  const verified = computeRiskFlags([modelRecall, noOpen], [], completeCoverage(), identity, []);
  assert(!verified.some((flag) => flag.id === "model-recalls-require-vin-check"), "manual no-open observation resolves model handoff");
}

console.log("9) regional packs state boundaries and input requirements");
{
  const pack = buildSearchPack("1HGCM82667A004352", ["CA", "UK", "EU", "PL"]);
  assert(pack.regions.length === 5 && pack.regions[0] === "US", "US baseline plus selected regions");
  assert(pack.regionalItems.some((item) => item.id === "ca-transport-recalls"), "Canada official tool");
  assert(pack.regionalItems.some((item) => item.id === "uk-mot-history" && /registration/.test(item.description ?? "")), "UK plate requirement explicit");
  assert(pack.regionalItems.some((item) => item.id === "pl-historia-pojazdu" && /registration/.test(item.description ?? "")), "Poland extra inputs explicit");
  assert(new Set(pack.allItems.map((item) => item.url)).size === pack.allItems.length, "search URLs deduplicated");
}

console.log("10) local proof ledger masks the VIN and exports operational fields");
{
  const report = {
    vin: "1HGCM82667A004352",
    queryTimeUtc: "2026-08-08T10:00:00.000Z",
    identity,
    riskLevel: "AMBER",
    evidenceCoverage: completeCoverage(),
    findings: [],
    paidReports: [],
    diagnostics: { totalDurationMs: 1234 },
  } as unknown as ReconstructResponse;
  const entry = await buildFieldTestEntry(report);
  assert(!entry.vinMasked.includes(report.vin), "full VIN absent from masked value");
  assert(entry.vinFingerprint.length === 16, "short SHA-256 fingerprint stored");
  const csv = fieldTestEntriesToCsv([entry]);
  assert(csv.includes("decision_relevant") && csv.includes("source_states"), "proof CSV includes decision and source fields");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
