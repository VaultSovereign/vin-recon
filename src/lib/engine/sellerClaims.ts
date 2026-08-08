// Seller claim checker. Never infers SUPPORTED from missing evidence; only marks
// SUPPORTED/CONTRADICTED when the retrieved evidence explicitly establishes it.
import { NormalizedRecord, SellerClaimResult } from "../types";

interface ClaimRule {
  match: RegExp;
  check: (records: NormalizedRecord[]) => Omit<SellerClaimResult, "claim">;
}

function findRecord(records: NormalizedRecord[], pattern: RegExp): NormalizedRecord | undefined {
  return records.find((r) => pattern.test([r.raw_excerpt, r.title_status, r.damage].filter(Boolean).join(" ")));
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
      const mileageRecords = records.filter((r) => r.mileage !== null);
      if (mileageRecords.length < 2) {
        return {
          verdict: "NOT_ESTABLISHED",
          evidence: "Insufficient independent mileage readings retrieved to establish this claim.",
          source: null,
        };
      }
      const decreasing = mileageRecords.some((r, i) => i > 0 && r.mileage! < mileageRecords[i - 1].mileage!);
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
