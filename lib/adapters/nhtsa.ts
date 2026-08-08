const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const RECALL_BASE = "https://api.nhtsa.gov/recalls";

interface VpicResult {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  EngineModel?: string;
  EngineCylinders?: string;
  FuelTypePrimary?: string;
  DriveType?: string;
  BodyClass?: string;
  Manufacturer?: string;
  PlantCountry?: string;
  PlantCompanyName?: string;
  PlantCity?: string;
  ErrorCode?: string;
  [key: string]: unknown;
}

interface VpicResponse {
  Results: VpicResult[];
}

export async function decodeVinNhtsa(vin: string): Promise<VpicResult | null> {
  try {
    const response = await fetch(
      `${VPIC_BASE}/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as VpicResponse;
    return data.Results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getVinRecalls(vin: string): Promise<unknown[]> {
  try {
    const response = await fetch(
      `${RECALL_BASE}/recallsByVehicle?vin=${encodeURIComponent(vin)}`,
      { next: { revalidate: 3600 } },
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { results?: unknown[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}
