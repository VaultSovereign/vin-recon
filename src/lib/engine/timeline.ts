// Timeline construction: converts normalized records with known event dates into a
// chronologically sorted timeline. Records without an event_date are excluded from the
// timeline (never invented) but remain visible in the raw evidence list.
import { NormalizedRecord, TimelineEntry } from "../types";

export function buildTimeline(records: NormalizedRecord[]): TimelineEntry[] {
  const dated = records.filter((r) => r.event_date !== null);

  const entries: TimelineEntry[] = dated.map((r) => ({
    date: r.event_date,
    source: r.source,
    location: r.location,
    mileage: r.mileage,
    mileageUnit: r.mileage_unit,
    event: r.event_type,
    evidenceUrl: r.source_url,
    confidence: r.confidence,
  }));

  return entries.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return a.date.localeCompare(b.date);
  });
}
