// Risk flag engine. Flags are derived strictly from retrieved evidence - GREEN never
// means "verified clean", only "no adverse evidence found in the sources checked".
//
// v0.1.2 hard rule: GREEN is only emitted when evidenceCoverage.greenEligible is true
// (all required automatic sources SUCCESS) AND no RED adverse evidence exists.
import {
  EvidenceCluster,
  EvidenceCoverage,
  NormalizedRecord,
  RiskFlag,
  RiskFlagLevel,
  TimelineEntry,
  VehicleIdentity,
} from "../types";

const ADVERSE_KEYWORDS: Record<string, RegExp> = {
  salvage: /\bsalvage\b/i,
  flood: /\bflood(ed)?\b/i,
  theft: /\btheft|stolen\b/i,
  airbag: /\bairbag\b.*\bdeploy/i,
  structural: /\bstructural (damage|repair)|frame damage\b/i,
  totaled: /\btotal(ed)? loss\b/i,
};

const NEGATION = /\b(no|not|never|without|none|zero|free of|not reported|no record of)\b/i;

function hasAffirmativeIndicator(text: string, pattern: RegExp): boolean {
  const segments = text.split(/[\n.;|]/);
  return segments.some((segment) => pattern.test(segment) && !NEGATION.test(segment));
}

function mileageKm(entry: TimelineEntry): number | null {
  if (entry.mileage === null || entry.mileageUnit === null) return null;
  return entry.mileageUnit === "mi" ? entry.mileage * 1.609344 : entry.mileage;
}

function explicitCountry(location: string | null): string | null {
  if (!location) return null;
  const value = location.toLowerCase();
  const countries: [string, RegExp][] = [
    ["US", /\b(united states|usa|u\.s\.a\.)\b/],
    ["CA", /\bcanada\b/],
    ["UK", /\b(united kingdom|great britain|england|scotland|wales|uk)\b/],
    ["PL", /\b(poland|polska)\b/],
    ["DE", /\b(germany|deutschland)\b/],
    ["FR", /\bfrance\b/],
  ];
  return countries.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

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
  coverage: EvidenceCoverage,
  identity?: VehicleIdentity,
  clusters: EvidenceCluster[] = []
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Adverse keyword scan across raw excerpts, title_status, and damage fields.
  for (const [key, pattern] of Object.entries(ADVERSE_KEYWORDS)) {
    const hitIndexes: number[] = [];
    records.forEach((r, idx) => {
      const haystack = [r.raw_excerpt, r.title_status, r.damage].filter(Boolean).join(" \n ");
      if (hasAffirmativeIndicator(haystack, pattern)) hitIndexes.push(idx);
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
  const mileageEntries = timeline.filter(
    (t) => t.mileage !== null && t.mileageUnit !== null && t.date !== null
  );
  for (let i = 1; i < mileageEntries.length; i++) {
    const prev = mileageEntries[i - 1];
    const curr = mileageEntries[i];
    const prevKm = mileageKm(prev);
    const currKm = mileageKm(curr);
    if (prevKm !== null && currKm !== null && currKm + 5 < prevKm) {
      pushFlag(
        flags,
        `mileage-inconsistency-${i}`,
        "RED",
        "Mileage inconsistency",
        `Mileage on ${curr.date} (${curr.mileage} ${curr.mileageUnit}) is lower than on ${prev.date} (${prev.mileage} ${prev.mileageUnit}) after unit normalization.`,
        [prev.recordIndex, curr.recordIndex]
      );
    }
  }

  // Multiple distinct auction events (mirrors of one event do not count twice).
  const auctionClusters = clusters.filter((cluster) =>
    cluster.recordIndexes.some((index) => /auction|copart|iaai|bidfax/i.test(records[index].source))
  );
  if (auctionClusters.length > 1) {
    pushFlag(
      flags,
      "multiple-auction-appearances",
      "AMBER",
      "Multiple auction appearances",
      `Vehicle appears in ${auctionClusters.length} distinct auction event cluster(s). Mirrored copies of one event were counted once.`,
      auctionClusters.flatMap((cluster) => cluster.recordIndexes)
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
        `No dated evidence was recorded between ${prevDate} and ${currDate} (~${gapYears.toFixed(1)} years).`,
        [timeline[i - 1].recordIndex, timeline[i].recordIndex]
      );
    }
  }

  // Event dates that are impossible relative to the report or decoded model year.
  const now = Date.now();
  timeline.forEach((entry, index) => {
    if (!entry.date) return;
    const eventTime = new Date(`${entry.date}T00:00:00Z`).getTime();
    if (Number.isFinite(eventTime) && eventTime > now + 24 * 60 * 60 * 1000) {
      pushFlag(
        flags,
        `future-event-${index}`,
        "AMBER",
        "Event date is in the future",
        `${entry.date} is later than the reconstruction date. Check the source transcription.`,
        [entry.recordIndex]
      );
    }
    const modelYear = Number(identity?.modelYear);
    if (Number.isInteger(modelYear) && Number(entry.date.slice(0, 4)) < modelYear - 1) {
      pushFlag(
        flags,
        `pre-model-year-event-${index}`,
        "AMBER",
        "Event predates the decoded vehicle year",
        `${entry.date} predates model year ${modelYear} by more than the allowed prior-year production window.`,
        [entry.recordIndex]
      );
    }
  });

  // A later "clean" statement does not silently erase an earlier adverse title brand.
  const titleEntries = timeline.filter((entry) => records[entry.recordIndex]?.title_status);
  const adverseTitleIndex = titleEntries.findIndex((entry) =>
    /salvage|junk|flood|rebuilt|total/i.test(records[entry.recordIndex].title_status ?? "")
  );
  if (adverseTitleIndex >= 0) {
    const earlier = titleEntries[adverseTitleIndex];
    const laterClean = titleEntries.slice(adverseTitleIndex + 1).find((entry) =>
      /\bclean\b/i.test(records[entry.recordIndex].title_status ?? "")
    );
    if (laterClean) {
      pushFlag(
        flags,
        "title-status-chronology-conflict",
        "RED",
        "Title-status chronology conflict",
        `An adverse title statement on ${earlier.date} is followed by a clean-title statement on ${laterClean.date}. Verify both with the issuing jurisdictions.`,
        [earlier.recordIndex, laterClean.recordIndex]
      );
    }
  }

  // Only explicit country labels are compared; no distance is inferred from free-form cities.
  for (let i = 1; i < timeline.length; i++) {
    const previous = timeline[i - 1];
    const current = timeline[i];
    if (!previous.date || !current.date) continue;
    const previousCountry = explicitCountry(previous.location);
    const currentCountry = explicitCountry(current.location);
    const dayGap =
      (new Date(`${current.date}T00:00:00Z`).getTime() - new Date(`${previous.date}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000);
    if (previousCountry && currentCountry && previousCountry !== currentCountry && dayGap >= 0 && dayGap <= 2) {
      pushFlag(
        flags,
        `country-transition-${i}`,
        "AMBER",
        "Unusual location transition",
        `Evidence changes from ${previousCountry} to ${currentCountry} within ${dayGap.toFixed(0)} day(s). Check dates and source identity.`,
        [previous.recordIndex, current.recordIndex]
      );
    }
  }

  const openRecallIndexes = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.event_type === "vin_recall_open_recalls_observed")
    .map(({ index }) => index);
  if (openRecallIndexes.length > 0) {
    pushFlag(
      flags,
      "vin-specific-open-recall",
      "AMBER",
      "Open recall observed in VIN-specific check",
      "The investigator recorded one or more open recalls on NHTSA's VIN-specific page. Confirm remedy status with a dealer.",
      openRecallIndexes
    );
  }

  const modelRecallIndexes = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) =>
      /recalls_(lookup|partial)/.test(record.event_type) && /^[1-9]\d* recall campaign\(s\) returned/.test(record.raw_excerpt ?? "")
    )
    .map(({ index }) => index);
  const noOpenRecallObserved = records.some(
    (record) => record.event_type === "vin_recall_no_open_recalls_observed"
  );
  if (modelRecallIndexes.length > 0 && !noOpenRecallObserved && openRecallIndexes.length === 0) {
    pushFlag(
      flags,
      "model-recalls-require-vin-check",
      "AMBER",
      "Recall campaigns apply to this model configuration",
      "The model-level API returned recall campaigns, but remedy status for this VIN was not established. Run the official VIN-specific check.",
      modelRecallIndexes
    );
  }

  const mismatchIndexes = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.event_type === "paid_report_vin_mismatch")
    .map(({ index }) => index);
  if (mismatchIndexes.length > 0) {
    pushFlag(
      flags,
      "paid-report-vin-mismatch",
      "AMBER",
      "Imported report VIN mismatch",
      "At least one imported report appears to identify a different VIN and was excluded from vehicle evidence.",
      mismatchIndexes
    );
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

  const hasAdverseOrUnresolvedFlag = flags.some((f) => f.level === "RED" || f.level === "AMBER");

  // GREEN only when required automatic sources succeeded, at least one FACT exists,
  // and no adverse or unresolved flag exists. Never mix a reassuring flag into an AMBER/RED result.
  if (!hasAdverseOrUnresolvedFlag && coverage.greenEligible && factRecords.length > 0) {
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
