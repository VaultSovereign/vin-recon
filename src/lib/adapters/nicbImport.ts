// Adapter: manual NICB VINCheck result import.
//
// NICB VINCheck is CAPTCHA-protected and must not be automated. Users run the check
// themselves at https://www.nicb.org/vincheck and paste the resulting page text here.
// This parser only extracts explicit statements from the pasted text - it never infers
// a "clean" result from absence of text.
import { NicbParsedResult, NormalizedRecord } from "../types";

const NICB_URL = "https://www.nicb.org/vincheck";

function extractVin(text: string): string | null {
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function findLineContaining(text: string, keywords: string[]): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      return line.trim();
    }
  }
  return null;
}

export function parseNicbResult(rawText: string): NicbParsedResult {
  const vin = extractVin(rawText);
  const titleBrandCheck = findLineContaining(rawText, ["title", "brand", "salvage", "flood", "junk"]);
  const theftCheck = findLineContaining(rawText, ["theft", "stolen", "recovered"]);

  return {
    vin,
    titleBrandCheck,
    theftCheck,
    raw: rawText.slice(0, 8000),
    parsedAt: new Date().toISOString(),
  };
}

export function nicbResultToRecords(vin: string, parsed: NicbParsedResult): NormalizedRecord[] {
  const retrievedAt = new Date().toISOString();
  const records: NormalizedRecord[] = [];

  if (parsed.vin && parsed.vin !== vin) {
    return [
      {
        vin,
        source: "NICB VINCheck (user-supplied)",
        source_url: NICB_URL,
        retrieved_at: retrievedAt,
        event_date: null,
        event_type: "nicb_vin_mismatch",
        mileage: null,
        mileage_unit: null,
        location: null,
        title_status: null,
        damage: null,
        raw_excerpt: `Pasted NICB result identifies VIN ${parsed.vin}; expected ${vin}. Result details were excluded.`,
        evidence_type: "UNKNOWN",
        confidence: "LOW",
        provenance: {
          kind: "USER_SUPPLIED_CHECK",
          origin: "NICB VINCheck",
          independenceKey: "nicb-vincheck",
          relationship: "ORIGINAL",
          independentlyRetrieved: false,
          note: "The supplied text appears to belong to a different VIN.",
        },
      },
    ];
  }

  if (parsed.titleBrandCheck) {
    records.push({
      vin,
      source: "NICB VINCheck (user-supplied)",
      source_url: NICB_URL,
      retrieved_at: retrievedAt,
      event_date: null,
      event_type: "nicb_title_brand",
      mileage: null,
      mileage_unit: null,
      location: null,
      title_status: parsed.titleBrandCheck,
      damage: null,
      raw_excerpt: parsed.titleBrandCheck,
      evidence_type: "OBSERVATION",
      confidence: "MEDIUM",
      provenance: {
        kind: "USER_SUPPLIED_CHECK",
        origin: "NICB VINCheck",
        independenceKey: "nicb-vincheck",
        relationship: "ORIGINAL",
        independentlyRetrieved: false,
        note: "Text was supplied by the user after a manual CAPTCHA-protected check.",
      },
    });
  }

  if (parsed.theftCheck) {
    records.push({
      vin,
      source: "NICB VINCheck (user-supplied)",
      source_url: NICB_URL,
      retrieved_at: retrievedAt,
      event_date: null,
      event_type: "nicb_theft",
      mileage: null,
      mileage_unit: null,
      location: null,
      title_status: null,
      damage: null,
      raw_excerpt: parsed.theftCheck,
      evidence_type: "OBSERVATION",
      confidence: "MEDIUM",
      provenance: {
        kind: "USER_SUPPLIED_CHECK",
        origin: "NICB VINCheck",
        independenceKey: "nicb-vincheck",
        relationship: "ORIGINAL",
        independentlyRetrieved: false,
        note: "Text was supplied by the user after a manual CAPTCHA-protected check.",
      },
    });
  }

  if (records.length === 0) {
    records.push({
      vin,
      source: "NICB VINCheck (user-supplied)",
      source_url: NICB_URL,
      retrieved_at: retrievedAt,
      event_date: null,
      event_type: "nicb_unparsed",
      mileage: null,
      mileage_unit: null,
      location: null,
      title_status: null,
      damage: null,
      raw_excerpt: parsed.raw,
      evidence_type: "UNKNOWN",
      confidence: "LOW",
      provenance: {
        kind: "USER_SUPPLIED_CHECK",
        origin: "NICB VINCheck",
        independenceKey: "nicb-vincheck",
        relationship: "ORIGINAL",
        independentlyRetrieved: false,
        note: "Text was supplied by the user but could not be parsed into an explicit result.",
      },
    });
  }

  return records;
}
