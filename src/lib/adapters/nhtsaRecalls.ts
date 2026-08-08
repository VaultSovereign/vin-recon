// Adapter: NHTSA recalls API (public, free, no key required).
// https://www.nhtsa.gov/nhtsa-datasets-and-apis#recalls
import { NormalizedRecord, Recall, RecallQueryResolution, SourceCoverageState } from "../types";
import { resolveRecallQueryIdentity } from "./nhtsaProductCatalog";

const RECALLS_BY_VIN = "https://api.nhtsa.gov/recalls/recallsByVehicle";

interface NhtsaRecallResult {
  Manufacturer?: string;
  NHTSACampaignNumber?: string;
  Component?: string;
  Summary?: string;
  ReportReceivedDate?: string;
}

interface NhtsaRecallResponse {
  Count?: number;
  count?: number;
  Message?: string;
  message?: string;
  results?: NhtsaRecallResult[];
}

export interface RecallLookupOutcome {
  recalls: Recall[];
  record: NormalizedRecord;
  sourceUrl: string;
  error: string | null;
  state: SourceCoverageState;
  query: RecallQueryResolution;
}

function recallRecord(
  vin: string,
  sourceUrl: string,
  retrievedAt: string,
  eventType: string,
  excerpt: string,
  evidenceType: NormalizedRecord["evidence_type"],
  confidence: NormalizedRecord["confidence"]
): NormalizedRecord {
  return {
    vin,
    source: "NHTSA Recalls",
    source_url: sourceUrl,
    retrieved_at: retrievedAt,
    event_date: null,
    event_type: eventType,
    mileage: null,
    mileage_unit: null,
    location: null,
    title_status: null,
    damage: null,
    raw_excerpt: excerpt,
    evidence_type: evidenceType,
    confidence,
    provenance: {
      kind: "AUTOMATIC_PUBLIC_SOURCE",
      origin: "NHTSA Recalls",
      independenceKey: "nhtsa-recalls",
      relationship: "ORIGINAL",
      independentlyRetrieved: true,
      note: null,
    },
  };
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
  const query = await resolveRecallQueryIdentity(make, model, modelYear);

  if (!make || !model || !modelYear) {
    const sourceUrl = RECALLS_BY_VIN;
    return {
      recalls: [],
      record: recallRecord(
        vin,
        sourceUrl,
        retrievedAt,
        "recalls_skipped",
        "Insufficient make/model/year decoded from VIN to query recalls.",
        "UNKNOWN",
        "LOW"
      ),
      sourceUrl,
      error: "Insufficient decoded vehicle data to query NHTSA recalls.",
      state: "NOT_RUN",
      query,
    };
  }

  const queryMake = query.canonical.make ?? make;
  const queryModel = query.canonical.model ?? model;
  const queryYear = query.canonical.modelYear ?? modelYear;
  const params = new URLSearchParams({ make: queryMake, model: queryModel, modelYear: queryYear });
  const sourceUrl = `${RECALLS_BY_VIN}?${params.toString()}`;

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let data: NhtsaRecallResponse | null = null;
    try {
      data = JSON.parse(text) as NhtsaRecallResponse;
    } catch {
      // handled as an unreadable response below
    }

    if (!data || !Array.isArray(data.results)) {
      const error = res.ok
        ? "NHTSA Recalls returned an unreadable response."
        : `NHTSA Recalls responded with HTTP ${res.status}.`;
      return {
        recalls: [],
        record: recallRecord(vin, sourceUrl, retrievedAt, "recalls_error", text.slice(0, 1000), "UNKNOWN", "LOW"),
        sourceUrl,
        error,
        state: "FAILED",
        query,
      };
    }

    const results = data.results ?? [];

    const recalls: Recall[] = results.map((r) => ({
      campaignNumber: r.NHTSACampaignNumber ?? "unknown",
      component: r.Component ?? "unknown",
      summary: r.Summary ?? "",
      reportReceivedDate: r.ReportReceivedDate ?? null,
      sourceUrl,
    }));

    const queryUnresolved = query.status === "UNRESOLVED";
    const httpAmbiguous = !res.ok;
    const state: SourceCoverageState = httpAmbiguous || queryUnresolved ? "PARTIAL" : "SUCCESS";
    const responseMessage = data.Message ?? data.message ?? "";
    const partialReasons = [
      httpAmbiguous ? `HTTP ${res.status} despite a readable response (${responseMessage || "no response message"})` : null,
      queryUnresolved ? query.detail : null,
    ].filter(Boolean);
    const error = partialReasons.length > 0 ? `Recall result is ambiguous: ${partialReasons.join("; ")}.` : null;
    const record = recallRecord(
      vin,
      sourceUrl,
      retrievedAt,
      state === "SUCCESS" ? "recalls_lookup" : "recalls_partial",
      `${recalls.length} recall campaign(s) returned for model-level query ${queryYear} ${queryMake} ${queryModel}. ${
        error ?? query.detail
      }`,
      state === "SUCCESS" ? "FACT" : "OBSERVATION",
      state === "SUCCESS" ? "HIGH" : "MEDIUM"
    );

    return { recalls, record, sourceUrl, error, state, query };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      recalls: [],
      record: recallRecord(vin, sourceUrl, retrievedAt, "recalls_error", message, "UNKNOWN", "LOW"),
      sourceUrl,
      error: `Failed to reach NHTSA Recalls: ${message}`,
      state: "FAILED",
      query,
    };
  }
}
