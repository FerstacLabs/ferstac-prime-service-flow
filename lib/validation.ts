import { z } from "zod";
import { azPlateSchema } from "@/lib/plate";

const azn = z.coerce.number().min(0, "Məbləğ mənfi ola bilməz.");

export const vehicleIntakeSchema = z.object({
  plate: azPlateSchema,
  make: z.string().min(1, "Marka tələb olunur."),
  model: z.string().min(1, "Model tələb olunur."),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  fundingSource: z.enum(["CUSTOMER_FUNDED", "INSURANCE_CLAIM"]),
  insuranceCompany: z.string().optional(),
  insuranceClaimNo: z.string().optional(),
  insuranceApprovedAmount: azn.optional(),
  agreedBudget: azn,
  plannedWorkIds: z.array(z.string()).min(1, "Ən azı bir görüləcək iş seçin."),
  customWorkTitle: z.string().optional()
});

export const purchaseSchema = z
  .object({
    serviceJobId: z.string().min(1),
    partCatalogId: z.string().optional(),
    customItemName: z.string().optional(),
    quantity: z.coerce.number().positive("Miqdar 0-dan böyük olmalıdır."),
    unitPrice: azn,
    sourceType: z.enum(["SUPPLIER", "INTERNAL_STOCK", "CUSTOMER_PROVIDED"]),
    supplierId: z.string().optional(),
    paymentStatus: z.enum(["PAID", "UNPAID", "PARTIAL"]),
    paidAmount: azn,
    purchaseDate: z.string().min(1)
  })
  .superRefine((value, ctx) => {
    const total = value.quantity * value.unitPrice;
    if (value.sourceType === "SUPPLIER" && !value.supplierId) {
      ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Təchizatçı seçilməlidir." });
    }
    if (value.paymentStatus === "PAID" && value.paidAmount !== total) {
      ctx.addIssue({ code: "custom", path: ["paidAmount"], message: "Ödənilib statusunda ödənən məbləğ cəmə bərabər olmalıdır." });
    }
    if (value.paymentStatus === "UNPAID" && value.paidAmount !== 0) {
      ctx.addIssue({ code: "custom", path: ["paidAmount"], message: "Ödənilməyib statusunda ödənən məbləğ 0 olmalıdır." });
    }
    if (value.paymentStatus === "PARTIAL" && (value.paidAmount <= 0 || value.paidAmount >= total)) {
      ctx.addIssue({ code: "custom", path: ["paidAmount"], message: "Qismən ödəniş 0-dan böyük və cəmdən kiçik olmalıdır." });
    }
  });

export const workerSchema = z.object({
  firstName: z.string().min(1, "Ad tələb olunur."),
  lastName: z.string().min(1, "Soyad tələb olunur."),
  role: z.string().min(1, "Rol tələb olunur.")
});
