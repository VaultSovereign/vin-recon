// Adapter: NHTSA vPIC VIN Decoder API (public, free, no key required).
// https://vpic.nhtsa.dot.gov/api/
import { NormalizedRecord, VehicleIdentity } from "../types";
import { validateVinCheckDigit } from "../vinCheckDigit";

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";

interface VpicResult {
  [key: string]: string | null;
}

interface VpicResponse {
  Results?: VpicResult[];
}

export interface VpicDecodeOutcome {
  identity: VehicleIdentity;
  record: NormalizedRecord;
  raw: VpicResult | null;
  sourceUrl: string;
  error: string | null;
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "Not Applicable" || trimmed === "0") return null;
  return trimmed;
}

export async function decodeVinWithVpic(vin: string): Promise<VpicDecodeOutcome> {
  const sourceUrl = `${VPIC_BASE}/${encodeURIComponent(vin)}?format=json`;
  const retrievedAt = new Date().toISOString();
  const checkDigit = validateVinCheckDigit(vin);

  const emptyIdentity: VehicleIdentity = {
    vin,
    make: null,
    model: null,
    modelYear: null,
    engine: null,
    drivetrain: null,
    body: null,
    manufacturer: null,
    plantCountry: null,
    plantCity: null,
    plantCompany: null,
    checkDigit,
  };

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        identity: emptyIdentity,
        record: {
          vin,
          source: "NHTSA vPIC",
          source_url: sourceUrl,
          retrieved_at: retrievedAt,
          event_date: null,
          event_type: "vin_decode_error",
          mileage: null,
          mileage_unit: null,
          location: null,
          title_status: null,
          damage: null,
          raw_excerpt: `HTTP ${res.status}`,
          evidence_type: "UNKNOWN",
          confidence: "LOW",
        },
        raw: null,
        sourceUrl,
        error: `NHTSA vPIC responded with HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as VpicResponse;
    const result = data.Results?.[0] ?? null;

    if (!result) {
      return {
        identity: emptyIdentity,
        record: {
          vin,
          source: "NHTSA vPIC",
          source_url: sourceUrl,
          retrieved_at: retrievedAt,
          event_date: null,
          event_type: "vin_decode_empty",
          mileage: null,
          mileage_unit: null,
          location: null,
          title_status: null,
          damage: null,
          raw_excerpt: null,
          evidence_type: "UNKNOWN",
          confidence: "LOW",
        },
        raw: null,
        sourceUrl,
        error: "NHTSA vPIC returned no results.",
      };
    }

    const identity: VehicleIdentity = {
      vin,
      make: clean(result.Make),
      model: clean(result.Model),
      modelYear: clean(result.ModelYear),
      engine: [clean(result.EngineCylinders), clean(result.DisplacementL) ? `${clean(result.DisplacementL)}L` : null, clean(result.EngineConfiguration)]
        .filter(Boolean)
        .join(" "),
      drivetrain: clean(result.DriveType),
      body: clean(result.BodyClass),
      manufacturer: clean(result.Manufacturer),
      plantCountry: clean(result.PlantCountry),
      plantCity: clean(result.PlantCity),
      plantCompany: clean(result.PlantCompanyName),
      checkDigit,
    };

    const record: NormalizedRecord = {
      vin,
      source: "NHTSA vPIC",
      source_url: sourceUrl,
      retrieved_at: retrievedAt,
      event_date: null,
      event_type: "vin_decode",
      mileage: null,
      mileage_unit: null,
      location: identity.plantCountry,
      title_status: null,
      damage: null,
      raw_excerpt: JSON.stringify(result).slice(0, 4000),
      evidence_type: "FACT",
      confidence: "HIGH",
    };

    return { identity, record, raw: result, sourceUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      identity: emptyIdentity,
      record: {
        vin,
        source: "NHTSA vPIC",
        source_url: sourceUrl,
        retrieved_at: retrievedAt,
        event_date: null,
        event_type: "vin_decode_error",
        mileage: null,
        mileage_unit: null,
        location: null,
        title_status: null,
        damage: null,
        raw_excerpt: message,
        evidence_type: "UNKNOWN",
        confidence: "LOW",
      },
      raw: null,
      sourceUrl,
      error: `Failed to reach NHTSA vPIC: ${message}`,
    };
  }
}
