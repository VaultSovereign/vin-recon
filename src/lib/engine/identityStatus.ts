// Derive IdentityStatus from decode fields + check-digit result.
import { IdentityStatus, VehicleIdentity, VinCheckDigitResult } from "../types";

export function deriveIdentityStatus(args: {
  make: string | null;
  model: string | null;
  modelYear: string | null;
  checkDigit: VinCheckDigitResult;
  decodeError: string | null;
}): { identityStatus: IdentityStatus; identityStatusDetail: string } {
  const { make, model, modelYear, checkDigit, decodeError } = args;
  const presentCount = [make, model, modelYear].filter(Boolean).length;
  const coreComplete = presentCount === 3;

  if (presentCount === 0) {
    return {
      identityStatus: "UNRESOLVED",
      identityStatusDetail: decodeError
        ? `Vehicle identity was not established: ${decodeError}`
        : "Vehicle identity was not established — NHTSA vPIC did not return make, model, or model year.",
    };
  }

  if (!coreComplete) {
    return {
      identityStatus: "PARTIAL",
      identityStatusDetail:
        "Partial identity only — one or more of make, model, or model year is missing from the decode.",
    };
  }

  if (!checkDigit.valid) {
    return {
      identityStatus: "CHECK_DIGIT_MISMATCH",
      identityStatusDetail:
        "Make/model/year decoded, but the SAE J853 check digit does not match. " +
        "Identity may still be useful; confirm the VIN was typed correctly" +
        (checkDigit.candidates.length > 0
          ? ` (candidate forms suggested: ${checkDigit.candidates.slice(0, 3).join(", ")}).`
          : "."),
    };
  }

  return {
    identityStatus: "ESTABLISHED",
    identityStatusDetail:
      "Factory identity established from NHTSA vPIC decode (make, model, model year) with a valid check digit.",
  };
}

export function applyIdentityStatus(
  identity: Omit<VehicleIdentity, "identityStatus" | "identityStatusDetail">,
  decodeError: string | null
): VehicleIdentity {
  const { identityStatus, identityStatusDetail } = deriveIdentityStatus({
    make: identity.make,
    model: identity.model,
    modelYear: identity.modelYear,
    checkDigit: identity.checkDigit,
    decodeError,
  });
  return { ...identity, identityStatus, identityStatusDetail };
}
