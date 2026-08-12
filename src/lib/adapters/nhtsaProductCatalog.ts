// NHTSA product-catalog canonicalization for make/model/year queries.
// Official sequence: year -> makes -> models -> issue endpoint.
import { RecallQueryResolution } from "../types";

const PRODUCT_BASE = "https://api.nhtsa.gov/products/vehicle";

interface ProductResult {
  modelYear?: string | number;
  make?: string;
  model?: string;
}

interface ProductResponse {
  results?: ProductResult[];
  message?: string;
  Message?: string;
}

function comparisonKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Conservative matching: punctuation/case differences only, then an unambiguous containment fallback. */
export function matchCanonicalProduct(input: string, candidates: string[]): string | null {
  const wanted = comparisonKey(input);
  if (!wanted) return null;
  const exact = unique(candidates).filter((candidate) => comparisonKey(candidate) === wanted);
  if (exact.length > 0) {
    return (
      exact.find((candidate) => candidate.toUpperCase() === input.trim().toUpperCase()) ??
      exact.sort((left, right) => left.length - right.length || left.localeCompare(right))[0]
    );
  }

  const containment = unique(candidates).filter((candidate) => {
    const key = comparisonKey(candidate);
    return key.length >= 3 && (key.includes(wanted) || wanted.includes(key));
  });
  const containmentKeys = new Set(containment.map(comparisonKey));
  return containmentKeys.size === 1 ? containment[0] : null;
}

async function fetchProducts(url: string): Promise<{ results: ProductResult[]; error: string | null }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    let data: ProductResponse | null = null;
    try {
      data = JSON.parse(text) as ProductResponse;
    } catch {
      // handled below as an unusable response
    }
    if (!response.ok) {
      return { results: data?.results ?? [], error: `NHTSA product catalog responded with HTTP ${response.status}.` };
    }
    if (!data || !Array.isArray(data.results)) {
      return { results: [], error: "NHTSA product catalog returned an unreadable response." };
    }
    return { results: data.results, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { results: [], error: `Failed to reach NHTSA product catalog: ${message}` };
  }
}

export async function resolveRecallQueryIdentity(
  make: string | null,
  model: string | null,
  modelYear: string | null
): Promise<RecallQueryResolution> {
  const requested = { make, model, modelYear };
  if (!make || !model || !modelYear) {
    return {
      status: "NOT_RUN",
      requested,
      canonical: { make: null, model: null, modelYear: null },
      detail: "Canonicalization was not run because make, model, or model year is missing.",
      sourceUrls: [],
    };
  }

  const makeUrl = `${PRODUCT_BASE}/makes?${new URLSearchParams({ modelYear, issueType: "r" })}`;
  const makeOutcome = await fetchProducts(makeUrl);
  if (makeOutcome.error) {
    return {
      status: "UNRESOLVED",
      requested,
      canonical: requested,
      detail: `${makeOutcome.error} The decoded values will be used as a fallback, with PARTIAL coverage.`,
      sourceUrls: [makeUrl],
    };
  }

  const canonicalMake = matchCanonicalProduct(
    make,
    makeOutcome.results.map((result) => result.make ?? "")
  );
  if (!canonicalMake) {
    return {
      status: "UNRESOLVED",
      requested,
      canonical: requested,
      detail: `Decoded make "${make}" did not map unambiguously to NHTSA's ${modelYear} recall catalog.`,
      sourceUrls: [makeUrl],
    };
  }

  const modelUrl = `${PRODUCT_BASE}/models?${new URLSearchParams({
    modelYear,
    make: canonicalMake,
    issueType: "r",
  })}`;
  const modelOutcome = await fetchProducts(modelUrl);
  if (modelOutcome.error) {
    return {
      status: "UNRESOLVED",
      requested,
      canonical: { make: canonicalMake, model, modelYear },
      detail: `${modelOutcome.error} The closest decoded values will be used as a fallback, with PARTIAL coverage.`,
      sourceUrls: [makeUrl, modelUrl],
    };
  }

  const canonicalModel = matchCanonicalProduct(
    model,
    modelOutcome.results.map((result) => result.model ?? "")
  );
  if (!canonicalModel) {
    return {
      status: "UNRESOLVED",
      requested,
      canonical: { make: canonicalMake, model, modelYear },
      detail: `Decoded model "${model}" did not map unambiguously to NHTSA's ${modelYear} ${canonicalMake} recall catalog.`,
      sourceUrls: [makeUrl, modelUrl],
    };
  }

  const changed = canonicalMake !== make || canonicalModel !== model;
  return {
    status: changed ? "NORMALIZED" : "EXACT",
    requested,
    canonical: { make: canonicalMake, model: canonicalModel, modelYear },
    detail: changed
      ? `Recall query normalized to ${modelYear} ${canonicalMake} ${canonicalModel}.`
      : "Decoded make/model/year exactly matched the NHTSA recall catalog.",
    sourceUrls: [makeUrl, modelUrl],
  };
}
