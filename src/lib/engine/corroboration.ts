// Conservative event grouping and independent-source counting.
// Multiple copies are not automatically multiple confirmations.
import { EvidenceCluster, NormalizedRecord } from "../types";

const NON_EVENT_TYPES = new Set([
  "vin_decode",
  "vin_decode_error",
  "vin_decode_empty",
  "recalls_lookup",
  "recalls_partial",
  "recalls_error",
  "recalls_skipped",
  "search_leads_generated",
]);

function clean(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(the|a|an|vehicle|car)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

function mileageKm(record: NormalizedRecord): number | null {
  if (record.mileage === null || record.mileage_unit === null) return null;
  return record.mileage_unit === "mi" ? record.mileage * 1.609344 : record.mileage;
}

function eventFamily(record: NormalizedRecord): string {
  if (record.title_status) return "title";
  if (record.damage) return "damage";
  if (record.mileage !== null) return "mileage";
  if (/auction/i.test(record.event_type + record.source)) return "auction";
  if (/theft|stolen/i.test(record.event_type + (record.raw_excerpt ?? ""))) return "theft";
  if (/recall/i.test(record.event_type)) return "recall";
  return record.event_type;
}

function eventKey(record: NormalizedRecord): string {
  const km = mileageKm(record);
  const mileageBucket = km === null ? "" : String(Math.round(km / 10) * 10);
  const signal = clean(record.title_status ?? record.damage ?? null);
  const location = clean(record.location);
  return [eventFamily(record), record.event_date ?? "undated", mileageBucket, signal, location].join("|");
}

function shouldCluster(record: NormalizedRecord): boolean {
  if (NON_EVENT_TYPES.has(record.event_type)) return false;
  return Boolean(
    record.event_date ||
      record.mileage !== null ||
      record.title_status ||
      record.damage ||
      /auction|theft|recall|paid_report|nicb/i.test(record.event_type)
  );
}

function summarize(records: NormalizedRecord[]): string {
  const first = records[0];
  const pieces = [
    first.event_date,
    eventFamily(first),
    first.title_status,
    first.damage,
    first.mileage !== null ? `${first.mileage} ${first.mileage_unit ?? ""}`.trim() : null,
    first.location,
  ].filter(Boolean);
  return pieces.join(" · ") || first.event_type;
}

export function buildEvidenceClusters(records: NormalizedRecord[]): EvidenceCluster[] {
  const grouped = new Map<string, number[]>();
  records.forEach((record, index) => {
    if (!shouldCluster(record)) return;
    const key = eventKey(record);
    grouped.set(key, [...(grouped.get(key) ?? []), index]);
  });

  return [...grouped.entries()].map(([key, recordIndexes], clusterIndex) => {
    const members = recordIndexes.map((index) => records[index]);
    const originalKeys = new Set(
      members
        .filter((record) => record.provenance.relationship !== "SYNDICATED")
        .map((record) => record.provenance.independenceKey)
    );
    const allKeys = new Set(members.map((record) => record.provenance.independenceKey));
    const independentSourceCount = originalKeys.size > 0 ? originalKeys.size : Math.min(allKeys.size, 1);
    const status =
      independentSourceCount >= 2
        ? "CORROBORATED"
        : recordIndexes.length > 1
          ? "DUPLICATE_ONLY"
          : "SINGLE_SOURCE";

    return {
      id: `event-${clusterIndex + 1}-${key.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`,
      eventType: eventFamily(members[0]),
      eventDate: members[0].event_date,
      summary: summarize(members),
      recordIndexes,
      independentSourceCount,
      independenceKeys: [...originalKeys.size ? originalKeys : allKeys],
      status,
    };
  });
}
