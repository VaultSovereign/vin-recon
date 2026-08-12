// VIN validation and check-digit computation per NHTSA / SAE J853 (US 17-char VINs).
import { VinCheckDigitResult } from "./types";

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Characters legal in a VIN (no I, O, Q). */
const VIN_ALPHABET = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";

export function isWellFormedVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

function charValue(ch: string): number | undefined {
  if (/[0-9]/.test(ch)) return parseInt(ch, 10);
  return TRANSLITERATION[ch];
}

/** Compute SAE J853 check digit for a well-formed 17-char VIN (or skeleton with any pos-9). */
export function computeCheckDigit(vinRaw: string): string | null {
  const vin = vinRaw.trim().toUpperCase();
  if (vin.length !== 17 || !isWellFormedVin(vin)) return null;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = charValue(vin[i]);
    if (value === undefined) return null;
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/**
 * Suggest alternate VINs when the supplied string may be mistyped.
 *
 * Always includes the VIN with a corrected check digit (position 9) when the
 * supplied check digit does not match. Also tries single-character substitutions
 * at non-check positions that would make the check digit consistent with the
 * supplied character (common OCR/typo recovery) — capped for usability.
 */
export function suggestCheckDigitCandidates(vinRaw: string, maxCandidates = 8): string[] {
  const vin = vinRaw.trim().toUpperCase();
  if (vin.length !== 17 || !isWellFormedVin(vin)) return [];

  const candidates: string[] = [];
  const seen = new Set<string>([vin]);

  const push = (next: string) => {
    if (seen.has(next)) return;
    seen.add(next);
    candidates.push(next);
  };

  const correctedDigit = computeCheckDigit(vin);
  if (correctedDigit !== null && correctedDigit !== vin[8]) {
    push(vin.slice(0, 8) + correctedDigit + vin.slice(9));
  }

  // Single-position typo recovery: for each non-check position, try alternate
  // alphabet chars such that the resulting VIN's check digit matches the supplied one.
  const suppliedCheck = vin[8];
  if (candidates.length < maxCandidates) {
    outer: for (let pos = 0; pos < 17; pos++) {
      if (pos === 8) continue;
      const original = vin[pos];
      for (const ch of VIN_ALPHABET) {
        if (ch === original) continue;
        const trial = vin.slice(0, pos) + ch + vin.slice(pos + 1);
        const digit = computeCheckDigit(trial);
        if (digit !== null && digit === suppliedCheck) {
          push(trial);
          if (candidates.length >= maxCandidates) break outer;
        }
      }
    }
  }

  return candidates;
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
      candidates: [],
    };
  }

  if (!isWellFormedVin(vin)) {
    return {
      valid: false,
      computedCheckDigit: null,
      suppliedCheckDigit: null,
      reason: "VIN contains invalid characters (I, O, Q are not permitted).",
      candidates: [],
    };
  }

  const computed = computeCheckDigit(vin);
  const supplied = vin[8];

  if (computed === null) {
    return {
      valid: false,
      computedCheckDigit: null,
      suppliedCheckDigit: supplied,
      reason: "Unable to compute check digit for this VIN.",
      candidates: [],
    };
  }

  const valid = computed === supplied;
  const candidates = valid ? [] : suggestCheckDigitCandidates(vin);

  return {
    valid,
    computedCheckDigit: computed,
    suppliedCheckDigit: supplied,
    reason: valid
      ? "Check digit matches computed value (SAE J853 North American scheme)."
      : "Check digit does not match computed value. This VIN may not follow the North American (SAE J853) check-digit scheme, or the VIN may be invalid/mistyped.",
    candidates,
  };
}
