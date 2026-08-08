// Privacy-first VIN search pack (mirrors src/lib/engine/searchPack.ts).
// Classic script — attaches to globalThis.VinReconPack for popup/content/background.
(function (global) {
  function buildEngineSearchUrl(engine, vin, extraQuery) {
    extraQuery = extraQuery || "";
    const phrase = `"${vin}"${extraQuery ? ` ${extraQuery}` : ""}`;
    const q = encodeURIComponent(phrase);
    switch (engine) {
      case "startpage":
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

  function buildSearchPack(vinRaw) {
    const vin = String(vinRaw || "").trim().toUpperCase();
    const v = encodeURIComponent(vin);
    const phrase = encodeURIComponent(`"${vin}"`);

    const privacyItems = [
      { id: "sp-exact", label: "Startpage (exact VIN)", url: buildEngineSearchUrl("startpage", vin), category: "privacy_web" },
      { id: "brave-exact", label: "Brave Search (exact VIN)", url: buildEngineSearchUrl("brave", vin), category: "privacy_web" },
      { id: "ddg-exact", label: "DuckDuckGo (exact VIN)", url: buildEngineSearchUrl("duckduckgo", vin), category: "privacy_web" },
      {
        id: "sp-adverse",
        label: "Startpage (VIN + salvage/flood/auction)",
        url: buildEngineSearchUrl("startpage", vin, "(salvage OR flood OR auction OR Copart OR IAAI OR Bidfax)"),
        category: "privacy_web",
      },
      {
        id: "sp-title",
        label: "Startpage (VIN + title/brand/odometer)",
        url: buildEngineSearchUrl("startpage", vin, "(title OR brand OR odometer OR mileage OR rollback)"),
        category: "privacy_web",
      },
      {
        id: "brave-theft",
        label: "Brave Search (VIN + stolen/theft/recovered)",
        url: buildEngineSearchUrl("brave", vin, "(stolen OR theft OR recovered)"),
        category: "privacy_web",
      },
      { id: "brave-images", label: "Brave Images (exact VIN)", url: `https://search.brave.com/images?q=${phrase}`, category: "privacy_web" },
    ];

    const googleItems = [
      {
        id: "google-exact",
        label: "Google (exact VIN) — optional",
        url: buildEngineSearchUrl("google", vin),
        category: "optional_google",
        privacyWarning: true,
      },
      {
        id: "google-adverse",
        label: "Google (VIN + salvage/flood) — optional",
        url: buildEngineSearchUrl("google", vin, "(salvage OR flood OR auction OR Copart OR IAAI)"),
        category: "optional_google",
        privacyWarning: true,
      },
    ];

    const auctionItems = [
      { id: "bidfax", label: "Bidfax (Copart/IAAI archive)", url: `https://en.bidfax.info/?s=${v}`, category: "auction" },
      { id: "copart", label: "Copart lot search", url: `https://www.copart.com/lotSearchResults/?free=true&query=${v}`, category: "auction" },
      { id: "iaai", label: "IAAI search", url: `https://www.iaai.com/Search?searchTerm=${v}`, category: "auction" },
    ];

    const governmentItems = [
      { id: "nicb", label: "NICB VINCheck (manual, CAPTCHA)", url: "https://www.nicb.org/vincheck", category: "government" },
      { id: "nhtsa-recalls", label: "NHTSA recalls by VIN", url: `https://www.nhtsa.gov/recalls?vin=${v}`, category: "government" },
      { id: "vpic", label: "NHTSA vPIC decoder", url: `https://vpic.nhtsa.dot.gov/decoder/Decoder?VIN=${v}`, category: "government" },
    ];

    const marketItems = [
      {
        id: "sp-us-market",
        label: "Startpage: VIN + US classifieds",
        url: buildEngineSearchUrl("startpage", vin, "(craigslist OR facebook marketplace OR cars.com OR autotrader)"),
        category: "market",
      },
    ];

    const regionalItems = [];
    const allItems = [...privacyItems, ...googleItems, ...auctionItems, ...governmentItems, ...marketItems];
    return {
      vin,
      generatedAt: new Date().toISOString(),
      privacyItems,
      googleItems,
      auctionItems,
      governmentItems,
      marketItems,
      regionalItems,
      regions: ["US"],
      allItems,
    };
  }

  function defaultOpenPackIds() {
    return ["sp-exact", "sp-adverse", "brave-exact", "bidfax", "copart", "iaai", "nicb"];
  }

  function isWellFormedVin(vin) {
    return /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(vin || "").trim());
  }

  function detectVinsInText(text) {
    if (!text) return [];
    const re = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
    const found = new Set();
    let m;
    while ((m = re.exec(text)) !== null) {
      found.add(m[0].toUpperCase());
    }
    return Array.from(found);
  }

  global.VinReconPack = {
    buildEngineSearchUrl,
    buildSearchPack,
    defaultOpenPackIds,
    isWellFormedVin,
    detectVinsInText,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
