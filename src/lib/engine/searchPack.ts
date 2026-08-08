// Privacy-first VIN search pack: human-openable URLs only — never scrapes.
// Used by the web app, reconstruct discovery, and the browser addon.
import type { ResearchRegion } from "../types";

export type SearchEngineId = "startpage" | "brave" | "duckduckgo" | "google";

export type SearchPackCategory =
  | "privacy_web"
  | "optional_google"
  | "auction"
  | "government"
  | "market"
  | "regional_official";

export interface SearchPackItem {
  id: string;
  label: string;
  url: string;
  category: SearchPackCategory;
  /** If true, only open when user opts into Google-quality search (privacy warning). */
  privacyWarning?: boolean;
  description?: string;
}

export interface SearchPack {
  vin: string;
  generatedAt: string;
  /** Default privacy engines (no Google). */
  privacyItems: SearchPackItem[];
  /** Optional Google (best recall, worst privacy) — never auto-opened by default. */
  googleItems: SearchPackItem[];
  /** Auction / salvage verticals. */
  auctionItems: SearchPackItem[];
  /** Gov / manual CAPTCHA tools. */
  governmentItems: SearchPackItem[];
  /** Regional classifieds-oriented queries. */
  marketItems: SearchPackItem[];
  /** Official tools for explicitly selected regions; all remain human-operated. */
  regionalItems: SearchPackItem[];
  regions: ResearchRegion[];
  /** Flat list for coverage lead counts / export. */
  allItems: SearchPackItem[];
}

export const DEFAULT_PRIVACY_ENGINES: SearchEngineId[] = ["startpage", "brave", "duckduckgo"];

function enc(vin: string): string {
  return encodeURIComponent(vin);
}

function encPhrase(vin: string): string {
  return encodeURIComponent(`"${vin}"`);
}

/** Exact-VIN web search URL for a privacy (or Google) engine. */
export function buildEngineSearchUrl(engine: SearchEngineId, vin: string, extraQuery = ""): string {
  const phrase = `"${vin}"${extraQuery ? ` ${extraQuery}` : ""}`;
  const q = encodeURIComponent(phrase);
  switch (engine) {
    case "startpage":
      // Startpage: Google-quality results via privacy proxy
      return `https://www.startpage.com/sp/search?query=${q}`;
    case "brave":
      return `https://search.brave.com/search?q=${q}`;
    case "duckduckgo":
      return `https://duckduckgo.com/?q=${q}`;
    case "google":
      return `https://www.google.com/search?q=${q}`;
    default:
      return `https://duckduckgo.com/?q=${q}`;
  }
}

/**
 * Build the full human research pack for a VIN.
 * Nothing is fetched — every URL is opened by a human (or the addon opens tabs).
 */
function normalizeRegions(regions: ResearchRegion[]): ResearchRegion[] {
  const allowed = new Set<ResearchRegion>(["US", "CA", "UK", "EU", "PL"]);
  return [...new Set(["US" as ResearchRegion, ...regions.filter((region) => allowed.has(region))])];
}

function deduplicateItems(items: SearchPackItem[]): SearchPackItem[] {
  const urls = new Set<string>();
  return items.filter((item) => {
    if (urls.has(item.url)) return false;
    urls.add(item.url);
    return true;
  });
}

export function buildSearchPack(vinRaw: string, requestedRegions: ResearchRegion[] = ["US"]): SearchPack {
  const vin = vinRaw.trim().toUpperCase();
  const regions = normalizeRegions(requestedRegions);
  const v = enc(vin);
  const phrase = encPhrase(vin);

  const privacyItems: SearchPackItem[] = [
    {
      id: "sp-exact",
      label: "Startpage (exact VIN)",
      url: buildEngineSearchUrl("startpage", vin),
      category: "privacy_web",
      description: "Google-quality results without searching as you on Google.",
    },
    {
      id: "brave-exact",
      label: "Brave Search (exact VIN)",
      url: buildEngineSearchUrl("brave", vin),
      category: "privacy_web",
      description: "Independent index; no personal search profile.",
    },
    {
      id: "ddg-exact",
      label: "DuckDuckGo (exact VIN)",
      url: buildEngineSearchUrl("duckduckgo", vin),
      category: "privacy_web",
    },
    {
      id: "sp-adverse",
      label: "Startpage (VIN + salvage/flood/auction)",
      url: buildEngineSearchUrl("startpage", vin, "(salvage OR flood OR auction OR Copart OR IAAI OR Bidfax)"),
      category: "privacy_web",
      description: "Adverse-signal oriented query.",
    },
    {
      id: "sp-title",
      label: "Startpage (VIN + title/brand/odometer)",
      url: buildEngineSearchUrl("startpage", vin, "(title OR brand OR odometer OR mileage OR rollback)"),
      category: "privacy_web",
      description: "Title and mileage oriented query; results remain unverified leads.",
    },
    {
      id: "brave-theft",
      label: "Brave Search (VIN + stolen/theft/recovered)",
      url: buildEngineSearchUrl("brave", vin, "(stolen OR theft OR recovered)"),
      category: "privacy_web",
      description: "Theft-oriented query; do not infer a result from search silence.",
    },
    {
      id: "brave-images",
      label: "Brave Images (exact VIN)",
      url: `https://search.brave.com/images?q=${phrase}`,
      category: "privacy_web",
      description: "Look for auction/listing photos indexed by VIN.",
    },
  ];

  const googleItems: SearchPackItem[] = [
    {
      id: "google-exact",
      label: "Google (exact VIN) — optional",
      url: buildEngineSearchUrl("google", vin),
      category: "optional_google",
      privacyWarning: true,
      description: "Often best recall; leaks intent to Google. Opt-in only.",
    },
    {
      id: "google-adverse",
      label: "Google (VIN + salvage/flood) — optional",
      url: buildEngineSearchUrl("google", vin, "(salvage OR flood OR auction OR Copart OR IAAI)"),
      category: "optional_google",
      privacyWarning: true,
    },
  ];

  const auctionItems: SearchPackItem[] = [
    {
      id: "bidfax",
      label: "Bidfax (Copart/IAAI archive)",
      url: `https://en.bidfax.info/?s=${v}`,
      category: "auction",
      description: "Historical salvage auction photos and sale data when indexed.",
    },
    {
      id: "copart",
      label: "Copart lot search",
      url: `https://www.copart.com/lotSearchResults/?free=true&query=${v}`,
      category: "auction",
    },
    {
      id: "iaai",
      label: "IAAI search",
      url: `https://www.iaai.com/Search?searchTerm=${v}`,
      category: "auction",
    },
  ];

  const governmentItems: SearchPackItem[] = [
    {
      id: "nicb",
      label: "NICB VINCheck (manual, CAPTCHA)",
      url: "https://www.nicb.org/vincheck",
      category: "government",
      description: "Paste the result back into VIN Recon — never automate CAPTCHA.",
    },
    {
      id: "nhtsa-recalls",
      label: "NHTSA recalls by VIN",
      url: `https://www.nhtsa.gov/recalls?vin=${v}`,
      category: "government",
    },
    {
      id: "vpic",
      label: "NHTSA vPIC decoder",
      url: `https://vpic.nhtsa.dot.gov/decoder/Decoder?VIN=${v}`,
      category: "government",
    },
  ];

  const marketItems: SearchPackItem[] = [
    {
      id: "sp-us-market",
      label: "Startpage: VIN + US classifieds",
      url: buildEngineSearchUrl("startpage", vin, "(craigslist OR facebook marketplace OR cars.com OR autotrader)"),
      category: "market",
      description: "US listing and dealer index query.",
    },
    ...(regions.includes("CA")
      ? [
          {
            id: "sp-ca-market",
            label: "Startpage: VIN + Canadian classifieds",
            url: buildEngineSearchUrl("startpage", vin, "(site:kijiji.ca OR site:autotrader.ca)"),
            category: "market" as const,
          },
        ]
      : []),
    ...(regions.some((region) => region === "EU" || region === "PL")
      ? [
          {
            id: "sp-mobilede",
            label: "Startpage: VIN + site:mobile.de",
            url: buildEngineSearchUrl("startpage", vin, "site:mobile.de"),
            category: "market" as const,
          },
          {
            id: "sp-autoscout",
            label: "Startpage: VIN + AutoScout24",
            url: buildEngineSearchUrl("startpage", vin, "site:autoscout24.de OR site:autoscout24.com"),
            category: "market" as const,
          },
        ]
      : []),
    ...(regions.includes("UK")
      ? [
          {
            id: "sp-uk-market",
            label: "Startpage: VIN + UK classifieds",
            url: buildEngineSearchUrl("startpage", vin, "(site:autotrader.co.uk OR site:ebay.co.uk/motors)"),
            category: "market" as const,
          },
        ]
      : []),
    ...(regions.includes("PL")
      ? [
          {
            id: "sp-pl-market",
            label: "Startpage: VIN + Polish classifieds",
            url: buildEngineSearchUrl("startpage", vin, "(site:otomoto.pl OR site:olx.pl)"),
            category: "market" as const,
          },
        ]
      : []),
  ];

  const regionalItems: SearchPackItem[] = [
    ...(regions.includes("CA")
      ? [
          {
            id: "ca-transport-recalls",
            label: "Transport Canada recall database",
            url: "https://recalls-rappels.canada.ca/en",
            category: "regional_official" as const,
            description: "Canadian model-level recall search; follow manufacturer VIN lookup where available.",
          },
        ]
      : []),
    ...(regions.includes("UK")
      ? [
          {
            id: "uk-mot-history",
            label: "GOV.UK MOT history",
            url: "https://www.gov.uk/check-mot-history",
            category: "regional_official" as const,
            description: "Requires the registration number; VIN alone is not enough for the public form.",
          },
        ]
      : []),
    ...(regions.includes("EU")
      ? [
          {
            id: "eu-safety-gate",
            label: "EU Safety Gate",
            url: "https://ec.europa.eu/safety-gate-alerts/screen/webReport",
            category: "regional_official" as const,
            description: "EU product/model recall context, not a VIN-specific history result.",
          },
        ]
      : []),
    ...(regions.includes("PL")
      ? [
          {
            id: "pl-historia-pojazdu",
            label: "Poland Historia Pojazdu",
            url: "https://www.gov.pl/web/gov/sprawdz-historie-pojazdu",
            category: "regional_official" as const,
            description: "Requires VIN, registration number, and first-registration date.",
          },
        ]
      : []),
  ];

  const allItems = deduplicateItems([
    ...privacyItems,
    ...googleItems,
    ...auctionItems,
    ...governmentItems,
    ...marketItems,
    ...regionalItems,
  ]);

  return {
    vin,
    generatedAt: new Date().toISOString(),
    privacyItems,
    googleItems,
    auctionItems,
    governmentItems,
    marketItems,
    regionalItems,
    regions,
    allItems,
  };
}

/** Leads suitable for the legacy discovery adapter shape. */
export function searchPackToLeads(pack: SearchPack): { label: string; url: string }[] {
  return pack.allItems.map((i) => ({ label: i.label, url: i.url }));
}

/**
 * IDs to open by default when the addon runs "Open privacy search pack".
 * Excludes Google (opt-in) to keep the default pack private.
 */
export function defaultOpenPackIds(): string[] {
  return [
    "sp-exact",
    "sp-adverse",
    "brave-exact",
    "bidfax",
    "copart",
    "iaai",
    "nicb",
  ];
}
