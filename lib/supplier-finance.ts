import { selectPurchases, type WorkshopData } from "@/lib/supabase/workshop";
import { supplierDisplayName } from "@/lib/supabase/queries";
import {
  paidFor,
  purchaseCost,
  purchaseDue,
  sumMoney,
  subtractMoney,
} from "@/lib/workshop";
import type { WorkshopFilters } from "@/lib/filters";

export function supplierFinance(data: WorkshopData, f: WorkshopFilters) {
  // Supplier debt is filtered after aggregation, never as a vehicle-debt filter.
  const items = selectPurchases(data, { ...f, balance: "" });
  const cost = sumMoney(items.map(purchaseCost));
  const paid = sumMoney(
    items.map((p) => paidFor(data.cash, "SUPPLIER_PURCHASE", p.id)),
  );
  const vat = sumMoney(
    items.map((p) =>
      subtractMoney(
        Number(p.vat_amount ?? 0),
        subtractMoney(p.returned ?? 0, p.returned_net ?? p.returned ?? 0),
      ),
    ),
  );
  const paidVat = sumMoney(
    data.cash
      .filter(
        (t) =>
          !t.voided_at &&
          t.allocation_type === "SUPPLIER_PURCHASE" &&
          items.some((p) => p.id === t.purchase_id),
      )
      .map((t) => t.vat_amount ?? 0),
  );
  const remaining = sumMoney(items.map((p) => purchaseDue(p, data.cash)));
  const remainingVat = sumMoney(items.map((p) => p.remaining_vat ?? 0));
  return {
    items,
    cost,
    paid,
    vat,
    gross: sumMoney([cost, vat]),
    paidVat,
    paidNet: subtractMoney(paid, paidVat),
    remaining,
    remainingVat,
    remainingNet: subtractMoney(remaining, remainingVat),
  };
}
export function selectSupplierFinances(data: WorkshopData, f: WorkshopFilters) {
  return data.suppliers
    .filter(
      (s) =>
        (!f.supplier || s.id === f.supplier) &&
        (!f.status || s.active === (f.status === "active")) &&
        [supplierDisplayName(s), s.tax_id_voen, s.phone]
          .join(" ")
          .toLocaleLowerCase("az")
          .includes(f.q.toLocaleLowerCase("az")),
    )
    .map((supplier) => ({
      supplier,
      ...supplierFinance(data, { ...f, supplier: supplier.id }),
    }))
    .filter((n) =>
      f.balance === "outstanding"
        ? n.remaining > 0
        : f.balance === "closed"
          ? n.remaining <= 0
          : true,
    );
}
