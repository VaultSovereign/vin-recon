// Privacy-first VIN search pack: human-openable URLs only — never scrapes.
// Used by the web app, reconstruct discovery, and the browser addon.

export type SearchEngineId = "startpage" | "brave" | "duckduckgo" | "google";

export type SearchPackCategory =
  | "privacy_web"
  | "optional_google"
  | "auction"
  | "government"
  | "market";

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
export function buildSearchPack(vinRaw: string): SearchPack {
  const vin = vinRaw.trim().toUpperCase();
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
      id: "sp-mobilede",
      label: "Startpage: VIN + site:mobile.de",
      url: buildEngineSearchUrl("startpage", vin, "site:mobile.de"),
      category: "market",
    },
    {
      id: "sp-autoscout",
      label: "Startpage: VIN + site:autoscout24.*",
      url: buildEngineSearchUrl("startpage", vin, "site:autoscout24.de OR site:autoscout24.com"),
      category: "market",
    },
    {
      id: "sp-craigslist",
      label: "Startpage: VIN + craigslist/facebook",
      url: buildEngineSearchUrl("startpage", vin, "(craigslist OR facebook marketplace OR kleinanzeigen)"),
      category: "market",
    },
  ];

  const allItems = [
    ...privacyItems,
    ...googleItems,
    ...auctionItems,
    ...governmentItems,
    ...marketItems,
  ];

  return {
    vin,
    generatedAt: new Date().toISOString(),
    privacyItems,
    googleItems,
    auctionItems,
    governmentItems,
    marketItems,
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
