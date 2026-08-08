// Purchase question generator: derives concrete buyer questions from risk flags,
// timeline gaps, and claim results.
import { RiskFlag, SellerClaimResult, TimelineEntry, VehicleIdentity } from "../types";

export function generatePurchaseQuestions(
  identity: VehicleIdentity,
  timeline: TimelineEntry[],
  riskFlags: RiskFlag[],
  claimResults: SellerClaimResult[]
): string[] {
  const questions: string[] = [];

  for (const flag of riskFlags) {
    if (flag.level === "RED") {
      questions.push(`Can you explain the "${flag.title.toLowerCase()}" evidence found: ${flag.detail}`);
    }
    if (flag.id.startsWith("mileage-inconsistency")) {
      questions.push("Can you account for the mileage discrepancy between the dates shown in the timeline?");
    }
    if (flag.id === "multiple-auction-appearances") {
      questions.push("Can you provide the original auction listing(s) and any repair documentation/photographs?");
    }
    if (flag.id.startsWith("chronology-gap")) {
      questions.push(`What happened to the vehicle during the gap described: ${flag.detail}`);
    }
  }

  for (const claim of claimResults) {
    if (claim.verdict === "CONTRADICTED") {
      questions.push(`You claimed "${claim.claim}" - how do you reconcile this with: ${claim.evidence}`);
    }
    if (claim.verdict === "NOT_ESTABLISHED") {
      questions.push(`Can you provide documentation supporting your claim of "${claim.claim}"?`);
    }
  }

  if (timeline.length === 0) {
    questions.push("Can you provide any prior registration, service, or sale records for this vehicle?");
  }

  if (!identity.plantCountry) {
    questions.push("Can you confirm the country/plant of assembly for this VIN?");
  }

  questions.push("Has this vehicle ever been declared a total loss by any insurer?");
  questions.push("Do you have the original title history and all prior owner disclosures?");

  // De-duplicate while preserving order, cap at 10.
  const seen = new Set<string>();
  const unique = questions.filter((q) => {
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });

  return unique.slice(0, 10);
}
