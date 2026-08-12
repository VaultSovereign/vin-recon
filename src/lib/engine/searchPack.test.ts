/**
 * Tests for search pack + user findings.
 * Run: npx tsx src/lib/engine/searchPack.test.ts
 */
import { buildSearchPack, defaultOpenPackIds, buildEngineSearchUrl } from "./searchPack";
import { findingsToRecords, parseUserFindings } from "./userFindings";

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

const vin = "1HGCM82667A004352";

console.log("1) search pack structure");
{
  const pack = buildSearchPack(vin);
  assert(pack.vin === vin, "vin normalized");
  assert(pack.privacyItems.length >= 3, "privacy items present");
  assert(pack.googleItems.every((i) => i.privacyWarning), "google marked privacyWarning");
  assert(pack.auctionItems.some((i) => i.id === "bidfax"), "bidfax present");
  assert(pack.allItems.length === pack.privacyItems.length + pack.googleItems.length + pack.auctionItems.length + pack.governmentItems.length + pack.marketItems.length + pack.regionalItems.length, "allItems sum");
  assert(defaultOpenPackIds().every((id) => pack.allItems.some((i) => i.id === id)), "default open ids exist");
  assert(!defaultOpenPackIds().some((id) => id.startsWith("google")), "default pack excludes google");
  assert(buildEngineSearchUrl("startpage", vin).includes("startpage.com"), "startpage url");
}

console.log("2) user findings → OBSERVATION records");
{
  const findings = parseUserFindings(vin, [
    {
      sourceLabel: "Bidfax",
      sourceUrl: "https://example.com/lot/1",
      note: "front damage visible",
      damage: "front-left",
      titleStatus: "salvage",
      mileage: 42000,
      mileageUnit: "mi",
      eventDate: "2022-01-15",
    },
  ]);
  assert(findings.length === 1, "one finding");
  const records = findingsToRecords(findings);
  assert(records[0].evidence_type === "OBSERVATION", "OBSERVATION category");
  assert(records[0].event_type === "user_observed_source", "event type");
  assert(records[0].provenance.independentlyRetrieved === false, "manual provenance");
  assert(records[0].damage === "front-left", "damage");
  assert(records[0].title_status === "salvage", "title");
  assert(/salvage/i.test(records[0].title_status || ""), "salvage detectable by risk engine");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
