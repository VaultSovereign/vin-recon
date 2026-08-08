// Adapter: NHTSA recalls API (public, free, no key required).
// https://www.nhtsa.gov/nhtsa-datasets-and-apis#recalls
import { NormalizedRecord, Recall } from "../types";

const RECALLS_BY_VIN = "https://api.nhtsa.gov/recalls/recallsByVehicle";

interface NhtsaRecallResult {
  Manufacturer?: string;
  NHTSACampaignNumber?: string;
  Component?: string;
  Summary?: string;
  ReportReceivedDate?: string;
}

interface NhtsaRecallResponse {
  results?: NhtsaRecallResult[];
}

export interface RecallLookupOutcome {
  recalls: Recall[];
  record: NormalizedRecord;
  sourceUrl: string;
  error: string | null;
}

/**
 * NHTSA's recall-by-vehicle endpoint takes make/model/modelYear (not VIN directly),
 * since recalls apply to vehicle configurations rather than individual VINs.
 */
export async function fetchRecallsForVehicle(
  vin: string,
  make: string | null,
  model: string | null,
  modelYear: string | null
): Promise<RecallLookupOutcome> {
  const retrievedAt = new Date().toISOString();

  if (!make || !model || !modelYear) {
    const sourceUrl = RECALLS_BY_VIN;
    return {
      recalls: [],
      record: {
        vin,
        source: "NHTSA Recalls",
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
        event_date: null,
        event_type: "recalls_skipped",
        mileage: null,
        mileage_unit: null,
        location: null,
        title_status: null,
        damage: null,
        raw_excerpt: "Insufficient make/model/year decoded from VIN to query recalls.",
        evidence_type: "UNKNOWN",
        confidence: "LOW",
      },
      sourceUrl,
      error: "Insufficient decoded vehicle data to query NHTSA recalls.",
    };
  }

  const params = new URLSearchParams({ make, model, modelYear });
  const sourceUrl = `${RECALLS_BY_VIN}?${params.toString()}`;

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        recalls: [],
        record: {
          vin,
          source: "NHTSA Recalls",
          source_url: sourceUrl,
          retrieved_at: retrievedAt,
          event_date: null,
          event_type: "recalls_error",
          mileage: null,
          mileage_unit: null,
          location: null,
          title_status: null,
          damage: null,
          raw_excerpt: `HTTP ${res.status}`,
          evidence_type: "UNKNOWN",
          confidence: "LOW",
        },
        sourceUrl,
        error: `NHTSA Recalls responded with HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as NhtsaRecallResponse;
    const results = data.results ?? [];

    const recalls: Recall[] = results.map((r) => ({
      campaignNumber: r.NHTSACampaignNumber ?? "unknown",
      component: r.Component ?? "unknown",
      summary: r.Summary ?? "",
      reportReceivedDate: r.ReportReceivedDate ?? null,
      sourceUrl,
    }));

    const record: NormalizedRecord = {
      vin,
      source: "NHTSA Recalls",
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      event_date: null,
      event_type: "recalls_lookup",
      mileage: null,
      mileage_unit: null,
      location: null,
      title_status: null,
      damage: null,
      raw_excerpt: `${recalls.length} recall(s) found for ${modelYear} ${make} ${model}.`,
      evidence_type: "FACT",
      confidence: "HIGH",
    };

    return { recalls, record, sourceUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      recalls: [],
      record: {
        vin,
        source: "NHTSA Recalls",
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
        event_date: null,
        event_type: "recalls_error",
        mileage: null,
        mileage_unit: null,
        location: null,
        title_status: null,
        damage: null,
        raw_excerpt: message,
        evidence_type: "UNKNOWN",
        confidence: "LOW",
      },
      sourceUrl,
      error: `Failed to reach NHTSA Recalls: ${message}`,
    };
  }
}
