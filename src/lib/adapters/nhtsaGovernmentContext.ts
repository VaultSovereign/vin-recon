// NHTSA model-level safety context. These results are never represented as
// events that happened to the individual VIN.
import { GovernmentContext, NhtsaComplaint, SourceCoverageState } from "../types";

const COMPLAINTS_BASE = "https://api.nhtsa.gov/complaints/complaintsByVehicle";
const INVESTIGATIONS_URL = "https://www.nhtsa.gov/search-safety-issues";
const COMMUNICATIONS_URL = "https://www.nhtsa.gov/recalls";

interface ComplaintResult {
  odiNumber?: string | number;
  components?: string;
  summary?: string;
  dateOfIncident?: string;
  dateComplaintFiled?: string;
  crash?: boolean;
  fire?: boolean;
  numberOfInjuries?: number;
  numberOfDeaths?: number;
}

interface ComplaintResponse {
  count?: number;
  Count?: number;
  message?: string;
  Message?: string;
  results?: ComplaintResult[];
}

function dateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const us = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function emptyContext(
  make: string | null,
  model: string | null,
  modelYear: string | null,
  state: SourceCoverageState,
  error: string | null
): GovernmentContext {
  const detail = make && model && modelYear ? `${modelYear} ${make} ${model}` : "vehicle model";
  return {
    scope: "MODEL_LEVEL",
    vehicle: { make, model, modelYear },
    disclaimer:
      "Complaints, investigations, and manufacturer communications describe a model population. They do not establish that this VIN experienced any reported condition.",
    complaints: {
      state,
      sourceUrl: COMPLAINTS_BASE,
      totalCount: null,
      returnedCount: 0,
      crashCount: 0,
      fireCount: 0,
      injuryCount: 0,
      deathCount: 0,
      topComponents: [],
      recent: [],
      error,
    },
    investigations: {
      label: `Search NHTSA investigations for ${detail}`,
      state: "SEARCH_LEADS_GENERATED",
      sourceUrl: INVESTIGATIONS_URL,
      detail: "Open the official NHTSA investigation search and use year, make, and model.",
    },
    manufacturerCommunications: {
      label: `Search NHTSA manufacturer communications / TSBs for ${detail}`,
      state: "SEARCH_LEADS_GENERATED",
      sourceUrl: COMMUNICATIONS_URL,
      detail: "Open NHTSA recalls, choose year/make/model, then review manufacturer communications.",
    },
  };
}

function normalizeComplaint(result: ComplaintResult): NhtsaComplaint {
  return {
    odiNumber: String(result.odiNumber ?? "unknown"),
    components: result.components?.trim() || "UNSPECIFIED",
    summary: result.summary?.trim().slice(0, 2000) || "",
    dateOfIncident: dateOnly(result.dateOfIncident),
    dateComplaintFiled: dateOnly(result.dateComplaintFiled),
    crash: Boolean(result.crash),
    fire: Boolean(result.fire),
    numberOfInjuries: Number.isFinite(result.numberOfInjuries) ? Number(result.numberOfInjuries) : 0,
    numberOfDeaths: Number.isFinite(result.numberOfDeaths) ? Number(result.numberOfDeaths) : 0,
  };
}

export async function fetchNhtsaGovernmentContext(
  make: string | null,
  model: string | null,
  modelYear: string | null
): Promise<GovernmentContext> {
  if (!make || !model || !modelYear) {
    return emptyContext(
      make,
      model,
      modelYear,
      "NOT_RUN",
      "Model-level NHTSA context was not queried because make, model, or model year is missing."
    );
  }

  const params = new URLSearchParams({ make, model, modelYear });
  const sourceUrl = `${COMPLAINTS_BASE}?${params}`;
  const base = emptyContext(make, model, modelYear, "FAILED", null);
  base.complaints.sourceUrl = sourceUrl;

  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data: ComplaintResponse | null = null;
    try {
      data = JSON.parse(text) as ComplaintResponse;
    } catch {
      // handled below
    }
    if (!data || !Array.isArray(data.results)) {
      base.complaints.error = response.ok
        ? "NHTSA complaints returned an unreadable response."
        : `NHTSA complaints responded with HTTP ${response.status}.`;
      return base;
    }

    const complaints = data.results.map(normalizeComplaint);
    const components = new Map<string, number>();
    complaints.forEach((complaint) => {
      complaint.components
        .split(",")
        .map((component) => component.trim())
        .filter(Boolean)
        .forEach((component) => components.set(component, (components.get(component) ?? 0) + 1));
    });
    const responseMessage = data.Message ?? data.message ?? "";
    const ambiguous = !response.ok;
    base.complaints = {
      state: ambiguous ? "PARTIAL" : "SUCCESS",
      sourceUrl,
      totalCount: data.Count ?? data.count ?? complaints.length,
      returnedCount: complaints.length,
      crashCount: complaints.filter((complaint) => complaint.crash).length,
      fireCount: complaints.filter((complaint) => complaint.fire).length,
      injuryCount: complaints.reduce((total, complaint) => total + complaint.numberOfInjuries, 0),
      deathCount: complaints.reduce((total, complaint) => total + complaint.numberOfDeaths, 0),
      topComponents: [...components.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 10)
        .map(([component, count]) => ({ component, count })),
      recent: complaints
        .sort((left, right) =>
          (right.dateComplaintFiled ?? right.dateOfIncident ?? "").localeCompare(
            left.dateComplaintFiled ?? left.dateOfIncident ?? ""
          )
        )
        .slice(0, 10),
      error: ambiguous
        ? `NHTSA complaints returned HTTP ${response.status} with a readable body (${responseMessage || "no message"}); context is PARTIAL.`
        : null,
    };
    return base;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    base.complaints.error = `Failed to reach NHTSA complaints: ${message}`;
    return base;
  }
}
