// VIN validation and check-digit computation per NHTSA / SAE J853 (US 17-char VINs).
import { VinCheckDigitResult } from "./types";

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function isWellFormedVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

/**
 * Computes and validates the check digit (position 9) of a 17-character VIN.
 * Only applicable/meaningful for VINs following the North American (SAE J853) scheme;
 * many non-NA VINs do not use this check digit convention, which is reflected in the result.
 */
export function validateVinCheckDigit(vinRaw: string): VinCheckDigitResult {
  const vin = vinRaw.trim().toUpperCase();

  if (vin.length !== 17) {
    return {
      valid: false,
      computedCheckDigit: null,
      suppliedCheckDigit: null,
      reason: `VIN must be exactly 17 characters (got ${vin.length}).`,
    };
  }

  if (!isWellFormedVin(vin)) {
    return {
      valid: false,
      computedCheckDigit: null,
      suppliedCheckDigit: null,
      reason: "VIN contains invalid characters (I, O, Q are not permitted).",
    };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value = /[0-9]/.test(ch) ? parseInt(ch, 10) : TRANSLITERATION[ch];
    if (value === undefined) {
      return {
        valid: false,
        computedCheckDigit: null,
        suppliedCheckDigit: vin[8],
        reason: `Unable to transliterate character '${ch}' at position ${i + 1}.`,
      };
    }
    sum += value * WEIGHTS[i];
  }

  const remainder = sum % 11;
  const computed = remainder === 10 ? "X" : String(remainder);
  const supplied = vin[8];
  const valid = computed === supplied;

  return {
    valid,
    computedCheckDigit: computed,
    suppliedCheckDigit: supplied,
    reason: valid
      ? "Check digit matches computed value (SAE J853 North American scheme)."
      : "Check digit does not match computed value. This VIN may not follow the North American (SAE J853) check-digit scheme, or the VIN may be invalid/mistyped.",
  };
}
