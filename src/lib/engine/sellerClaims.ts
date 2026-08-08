// Seller claim checker. Never infers SUPPORTED from missing evidence; only marks
// SUPPORTED/CONTRADICTED when the retrieved evidence explicitly establishes it.
import { NormalizedRecord, SellerClaimResult } from "../types";

interface ClaimRule {
  match: RegExp;
  check: (records: NormalizedRecord[]) => Omit<SellerClaimResult, "claim">;
}

const NEGATION = /\b(no|not|never|without|none|free of|not reported|no record of)\b/i;

function findRecord(records: NormalizedRecord[], pattern: RegExp): NormalizedRecord | undefined {
  return records.find((record) => {
    if (record.damage && pattern.test(record.damage) && !NEGATION.test(record.damage)) return true;
    if (record.title_status && pattern.test(record.title_status) && !NEGATION.test(record.title_status)) return true;
    return (record.raw_excerpt ?? "")
      .split(/[\n.;|]/)
      .some((segment) => pattern.test(segment) && !NEGATION.test(segment));
  });
}

function mileageKm(record: NormalizedRecord): number | null {
  if (record.mileage === null || record.mileage_unit === null) return null;
  return record.mileage_unit === "mi" ? record.mileage * 1.609344 : record.mileage;
}

const CLAIM_RULES: ClaimRule[] = [
  {
    match: /accident[- ]?free/i,
    check: (records) => {
      const contradicting = findRecord(records, /accident|damage|structural|collision/i);
      if (contradicting) {
        return {
          verdict: "CONTRADICTED",
          evidence: contradicting.raw_excerpt ?? contradicting.event_type,
          source: contradicting.source_url,
        };
      }
      return {
        verdict: "NOT_ESTABLISHED",
        evidence: "No contradictory evidence found in the sources searched.",
        source: null,
      };
    },
  },
  {
    match: /first owner/i,
    check: () => ({
      verdict: "NOT_ESTABLISHED",
      evidence: "Ownership history is not available from any queried public source.",
      source: null,
    }),
  },
  {
    match: /original mileage/i,
    check: (records) => {
      const mileageRecords = records
        .filter((record) => record.mileage !== null && record.mileage_unit !== null && record.event_date !== null)
        .sort((left, right) => left.event_date!.localeCompare(right.event_date!));
      if (mileageRecords.length < 2) {
        return {
          verdict: "NOT_ESTABLISHED",
          evidence: "Insufficient independent mileage readings retrieved to establish this claim.",
          source: null,
        };
      }
      const decreasing = mileageRecords.some((record, index) => {
        if (index === 0) return false;
        const current = mileageKm(record);
        const previous = mileageKm(mileageRecords[index - 1]);
        return current !== null && previous !== null && current + 5 < previous;
      });
      if (decreasing) {
        return {
          verdict: "CONTRADICTED",
          evidence: "Retrieved mileage readings are not monotonically increasing across sources.",
          source: mileageRecords[0].source_url,
        };
      }
      return {
        verdict: "NOT_ESTABLISHED",
        evidence: "No contradictory evidence found in the sources searched.",
        source: null,
      };
    },
  },
  {
    match: /serviced at dealer|dealer service/i,
    check: () => ({
      verdict: "NOT_ESTABLISHED",
      evidence: "Service records are not available from any queried public source.",
      source: null,
    }),
  },
  {
    match: /no structural repairs?/i,
    check: (records) => {
      const contradicting = findRecord(records, /structural/i);
      if (contradicting) {
        return {
          verdict: "CONTRADICTED",
          evidence: contradicting.raw_excerpt ?? contradicting.event_type,
          source: contradicting.source_url,
        };
      }
      return {
        verdict: "NOT_ESTABLISHED",
        evidence: "No contradictory evidence found in the sources searched.",
        source: null,
      };
    },
  },
];

export function checkSellerClaims(claims: string[], records: NormalizedRecord[]): SellerClaimResult[] {
  return claims
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0)
    .map((claim) => {
      const rule = CLAIM_RULES.find((r) => r.match.test(claim));
      if (rule) {
        return { claim, ...rule.check(records) };
      }
      return {
        claim,
        verdict: "NOT_ESTABLISHED" as const,
        evidence: "No automated check exists for this claim type; no contradictory evidence found in the sources searched.",
        source: null,
      };
    });
}
