// Risk flag engine. Flags are derived strictly from retrieved evidence - GREEN never
// means "verified clean", only "no adverse evidence found in the sources checked".
import { NormalizedRecord, RiskFlag, TimelineEntry } from "../types";

const ADVERSE_KEYWORDS: Record<string, RegExp> = {
  salvage: /\bsalvage\b/i,
  flood: /\bflood(ed)?\b/i,
  theft: /\btheft|stolen\b/i,
  airbag: /\bairbag\b.*\bdeploy/i,
  structural: /\bstructural (damage|repair)|frame damage\b/i,
  totaled: /\btotal(ed)? loss\b/i,
};

function pushFlag(
  flags: RiskFlag[],
  id: string,
  level: RiskFlag["level"],
  title: string,
  detail: string,
  supportingRecordIndexes: number[] = []
) {
  flags.push({ id, level, title, detail, supportingRecordIndexes });
}

export function computeRiskFlags(records: NormalizedRecord[], timeline: TimelineEntry[]): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Adverse keyword scan across raw excerpts, title_status, and damage fields.
  for (const [key, pattern] of Object.entries(ADVERSE_KEYWORDS)) {
    const hitIndexes: number[] = [];
    records.forEach((r, idx) => {
      const haystack = [r.raw_excerpt, r.title_status, r.damage].filter(Boolean).join(" \n ");
      if (pattern.test(haystack)) hitIndexes.push(idx);
    });
    if (hitIndexes.length > 0) {
      pushFlag(
        flags,
        `adverse-${key}`,
        "RED",
        `${key.charAt(0).toUpperCase() + key.slice(1)} indicator found`,
        `Evidence text matching a "${key}" indicator was found in ${hitIndexes.length} record(s).`,
        hitIndexes
      );
    }
  }

  // Mileage inconsistency: mileage should be non-decreasing over time.
  const mileageEntries = timeline.filter((t) => t.mileage !== null && t.date !== null);
  for (let i = 1; i < mileageEntries.length; i++) {
    const prev = mileageEntries[i - 1];
    const curr = mileageEntries[i];
    if (prev.mileage !== null && curr.mileage !== null && curr.mileage < prev.mileage) {
      pushFlag(
        flags,
        `mileage-inconsistency-${i}`,
        "RED",
        "Mileage inconsistency",
        `Mileage on ${curr.date} (${curr.mileage} ${curr.mileageUnit ?? ""}) is lower than on ${prev.date} (${prev.mileage} ${prev.mileageUnit ?? ""}).`
      );
    }
  }

  // Multiple auction appearances.
  const auctionSources = records.filter((r) => /auction|copart|iaai|bidfax/i.test(r.source));
  if (auctionSources.length > 1) {
    pushFlag(
      flags,
      "multiple-auction-appearances",
      "AMBER",
      "Multiple auction appearances",
      `Vehicle appears to be referenced in ${auctionSources.length} auction-related source(s). Review for repeated resale after damage.`
    );
  }

  // Unexplained chronology gaps (> 2 years between consecutive dated timeline entries).
  for (let i = 1; i < timeline.length; i++) {
    const prevDate = timeline[i - 1].date;
    const currDate = timeline[i].date;
    if (!prevDate || !currDate) continue;
    const gapMs = new Date(currDate).getTime() - new Date(prevDate).getTime();
    const gapYears = gapMs / (1000 * 60 * 60 * 24 * 365.25);
    if (gapYears > 2) {
      pushFlag(
        flags,
        `chronology-gap-${i}`,
        "AMBER",
        "Unexplained chronology gap",
        `No evidence found between ${prevDate} and ${currDate} (~${gapYears.toFixed(1)} years).`
      );
    }
  }

  // If no adverse evidence and no records at all beyond decode, flag AMBER incompleteness.
  const nonDecodeRecords = records.filter((r) => !r.event_type.startsWith("vin_decode") && r.event_type !== "search_leads_generated");
  if (nonDecodeRecords.length === 0) {
    pushFlag(
      flags,
      "incomplete-evidence",
      "AMBER",
      "Incomplete evidence base",
      "Only factory decode data was retrieved automatically. Public history sources require manual review via the generated search leads, and NICB/NMVTIS/CARFAX results (if any) have not been imported."
    );
  }

  if (flags.filter((f) => f.level === "RED").length === 0) {
    pushFlag(
      flags,
      "no-adverse-evidence",
      "GREEN",
      "No adverse evidence found",
      "No adverse evidence found in the sources checked."
    );
  }

  return flags;
}
