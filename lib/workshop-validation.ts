import { z } from "zod";
export const noteSchema = z
  .string()
  .trim()
  .max(250, "Qeyd maksimum 250 simvol ola bilər.");
export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Məbləğ ən çox 2 onluq rəqəm ola bilər.",
  );
export const quoteLinesSchema = z
  .array(
    z.object({
      catalogId: z.string().uuid(),
      quotedPrice: moneySchema,
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
