// Risk flag engine. Flags are derived strictly from retrieved evidence - GREEN never
// means "verified clean", only "no adverse evidence found in the sources checked".
//
// v0.1.2 hard rule: GREEN is only emitted when evidenceCoverage.greenEligible is true
// (all required automatic sources SUCCESS) AND no RED adverse findings exist.
import { EvidenceCoverage, NormalizedRecord, RiskFlag, RiskFlagLevel, TimelineEntry } from "../types";

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

export function worstRiskLevel(flags: RiskFlag[]): RiskFlagLevel {
  if (flags.some((f) => f.level === "RED")) return "RED";
  if (flags.some((f) => f.level === "AMBER")) return "AMBER";
  if (flags.some((f) => f.level === "GREEN")) return "GREEN";
  // No flags at all — treat as AMBER (never imply clean from silence).
  return "AMBER";
}

export function computeRiskFlags(
  records: NormalizedRecord[],
  timeline: TimelineEntry[],
  coverage: EvidenceCoverage
): RiskFlag[] {
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

  // Coverage incompleteness is always surfaced when GREEN is not eligible.
  if (!coverage.greenEligible) {
    pushFlag(
      flags,
      "incomplete-search",
      "AMBER",
      "Search incomplete — no conclusion about adverse history",
      coverage.summary
    );
  }

  // Zero retrieved FACT records must never imply clean history.
  const factRecords = records.filter((r) => r.evidence_type === "FACT");
  if (factRecords.length === 0) {
    pushFlag(
      flags,
      "zero-fact-records",
      "AMBER",
      "No factual evidence records retrieved",
      "Zero FACT records were retrieved. Absence of records must never be treated as a clean history."
    );
  }

  const hasRed = flags.some((f) => f.level === "RED");

  // GREEN only when required automatic sources succeeded, at least one FACT exists,
  // and no adverse (RED) evidence. Never emit GREEN alongside incomplete-search or zero facts.
  if (!hasRed && coverage.greenEligible && factRecords.length > 0) {
    pushFlag(
      flags,
      "no-adverse-evidence",
      "GREEN",
      "No adverse evidence found",
      "No adverse evidence found in the sources checked. This is not a certification of a clean history."
    );
  }

  return flags;
}
