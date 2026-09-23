import { z } from "zod";
import { decimalMinor, parseLocalizedDecimal } from "@/lib/decimal";
export const noteSchema = z
  .string()
  .trim()
  .max(250, "Qeyd maksimum 250 simvol ola bilər.");
const decimalSchema = (scale: number, min: bigint, max: bigint) =>
  z.unknown().transform((value, ctx) => {
    try {
      const canonical = parseLocalizedDecimal(value, scale),
        minor = decimalMinor(canonical, scale);
      if (minor < min || minor > max)
        throw new Error("Məbləğ icazə verilən aralıqda deyil.");
      return canonical;
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });
export const moneySchema = decimalSchema(2, 0n, 999999999999n);
export const quantitySchema = decimalSchema(3, 1n, 100000000n);
export const quoteLinesSchema = z
  .array(
    z.object({
      catalogId: z.string().uuid(),
      quotedPrice: moneySchema,
      quantity: quantitySchema.default("1.000"),
      unitId: z.string().uuid().optional(),
      costNote: noteSchema.default(""),
      note: noteSchema,
    }),
  )
  .max(100)
  .refine(
    (rows) => new Set(rows.map((r) => r.catalogId)).size === rows.length,
    "Təkrar sətir seçilib.",
  );
export const textValue = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
export const noteValue = (form: FormData, key = "notes") =>
  noteSchema.parse(textValue(form, key)) || null;
export const uuidValue = (form: FormData, key: string) =>
  z.string().uuid().parse(textValue(form, key));
