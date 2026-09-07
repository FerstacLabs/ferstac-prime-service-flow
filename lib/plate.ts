import { z } from "zod";

const PLATE_PATTERN = /^(\d{2})([A-Z]{2})(\d{3})$/;
const NORMALIZED_PLATE_PATTERN = /^\d{2}-[A-Z]{2}-\d{3}$/;

export function normalizeAzPlate(input: string) {
  const compact = input.trim().replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
  const safe = compact.replace(/[^0-9A-Z]/g, "").slice(0, 7);
  const match = safe.match(PLATE_PATTERN);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const first = safe.slice(0, 2);
  const second = safe.slice(2, 4);
  const third = safe.slice(4, 7);
  return [first, second, third].filter(Boolean).join("-");
}

export function isValidAzPlate(input: string) {
  return NORMALIZED_PLATE_PATTERN.test(normalizeAzPlate(input));
}

export const azPlateSchema = z
  .string()
  .trim()
  .transform(normalizeAzPlate)
  .refine(isValidAzPlate, "Dövlət qeydiyyat nişanı 99-AA-999 formatında olmalıdır.");
