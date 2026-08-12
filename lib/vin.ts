const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const transliteration: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isVinFormatValid(vin: string): boolean {
  return VIN_REGEX.test(vin);
}

export function calculateVinCheckDigit(vin: string): string {
  const sum = vin.split("").reduce((acc, char, index) => {
    const value = /[0-9]/.test(char) ? Number(char) : transliteration[char] ?? 0;
    return acc + value * weights[index];
  }, 0);

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function hasValidVinCheckDigit(vin: string): boolean {
  if (!isVinFormatValid(vin)) {
    return false;
  }

  return vin[8] === calculateVinCheckDigit(vin);
}
