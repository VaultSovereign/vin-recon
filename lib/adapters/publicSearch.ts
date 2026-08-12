import type { Confidence, NormalizedRecord } from "@/lib/types";

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

function classifyEventType(text: string): string {
  const sourceText = text.toLowerCase();

  if (sourceText.includes("auction") || sourceText.includes("lot")) return "auction_listing";
  if (sourceText.includes("salvage")) return "salvage_listing";
  if (sourceText.includes("dealer")) return "dealer_listing";
  if (sourceText.includes("classified")) return "classified_listing";
  if (sourceText.includes("forum")) return "forum_post";
  if (sourceText.includes("accident") || sourceText.includes("damage")) return "damage_reference";
  return "public_reference";
}

function extractMileage(text: string): { value: number; unit: "mi" | "km" } | null {
  const mileageMatch = text.match(/(\d{1,3}(?:[,\.]\d{3})+|\d{4,6})\s?(mi|miles|km)/i);
  if (!mileageMatch) {
    return null;
  }

  const value = Number(mileageMatch[1].replace(/[,.]/g, ""));
  const unit = mileageMatch[2].toLowerCase().startsWith("k") ? "km" : "mi";
  return Number.isNaN(value) ? null : { value, unit };
}

function guessConfidence(hit: SearchHit): Confidence {
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  if (/(auction|salvage|dealer|mileage|damage|title)/.test(text)) {
    return "HIGH";
  }

  if (/(forum|cached|listing)/.test(text)) {
    return "MEDIUM";
  }

  return "LOW";
}

function parseSearchHits(html: string): SearchHit[] {
  const anchors = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];

  return anchors.slice(0, 12).map((anchor, index) => {
    const title = anchor[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippetRaw = snippets[index]?.[1] ?? "";
    const snippet = snippetRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    return {
      title,
      url: decodeDuckDuckGoRedirect(anchor[1]),
      snippet,
    };
  });
}

export async function searchExactVinPublicRecords(vin: string): Promise<NormalizedRecord[]> {
  try {
    // Public index lookup is intentionally lightweight and replaceable; parser may need updates if provider markup changes.
    const query = encodeURIComponent(`"${vin}"`);
    const response = await fetch(`https://duckduckgo.com/html/?q=${query}`, {
      headers: {
        "User-Agent": "VIN-Recon/1.0 (public-index lookup)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const hits = parseSearchHits(html);
    const now = new Date().toISOString();

    return hits.map((hit) => {
      const combined = `${hit.title} ${hit.snippet}`;
      const mileage = extractMileage(combined);

      return {
        vin,
        source: "DuckDuckGo (public index)",
        source_url: hit.url,
        retrieved_at: now,
        event_date: null,
        event_type: classifyEventType(combined),
        mileage: mileage?.value ?? null,
        mileage_unit: mileage?.unit ?? null,
        location: null,
        title_status: /(salvage|rebuilt|flood|theft|clean title)/i.exec(combined)?.[1] ?? null,
        damage: /(damage|accident|collision|airbag)[^.;|]*/i.exec(combined)?.[0] ?? null,
        raw_excerpt: `${hit.title} — ${hit.snippet}`,
        evidence_type: "search_index_result",
        confidence: guessConfidence(hit),
      };
    });
  } catch {
    return [];
  }
}
