// Adapter: public web/auction search "discovery" for an exact VIN.
//
// IMPORTANT: This adapter does NOT scrape search engines or auction sites (that would
// risk violating robots.txt/ToS and could require bypassing access controls). Instead it
// deterministically builds a set of public, indexable search URLs for the exact VIN string
// so a human reviewer can open them and manually capture any evidence found. Nothing here
// is fabricated as a "finding" - each entry is explicitly UNKNOWN until a human confirms it.
import { NormalizedRecord } from "../types";

export interface SearchLead {
  label: string;
  url: string;
}

export function buildVinSearchLeads(vin: string): SearchLead[] {
  const q = encodeURIComponent(vin);
  return [
    { label: "Google (exact VIN)", url: `https://www.google.com/search?q=%22${q}%22` },
    { label: "Bing (exact VIN)", url: `https://www.bing.com/search?q=%22${q}%22` },
    { label: "DuckDuckGo (exact VIN)", url: `https://duckduckgo.com/?q=%22${q}%22` },
    { label: "Copart (salvage auction)", url: `https://www.copart.com/lotSearchResults/?free=true&query=${q}` },
    { label: "IAAI (salvage auction)", url: `https://www.iaai.com/Search?searchTerm=${q}` },
    { label: "Bidfax (auction photo archive)", url: `https://www.bidfax.info/?s=${q}` },
    { label: "NICB VINCheck (manual, CAPTCHA-protected)", url: `https://www.nicb.org/vincheck` },
  ];
}

export function buildSearchDiscoveryRecord(vin: string, leads: SearchLead[]): NormalizedRecord {
  return {
    vin,
    source: "Public Search Discovery",
    source_url: null,
    retrieved_at: new Date().toISOString(),
    event_date: null,
    event_type: "search_leads_generated",
    mileage: null,
    mileage_unit: null,
    location: null,
    title_status: null,
    damage: null,
    raw_excerpt: `Generated ${leads.length} public search leads for exact-VIN review. No pages were fetched or scraped; a human must open these links and manually record any findings.`,
    evidence_type: "UNKNOWN",
    confidence: "LOW",
  };
}
