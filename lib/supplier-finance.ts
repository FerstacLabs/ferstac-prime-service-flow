import { selectPurchases, type WorkshopData } from "@/lib/supabase/workshop";
import { supplierDisplayName } from "@/lib/supabase/queries";
import { paidFor, purchaseCost, subtractMoney, sumMoney } from "@/lib/workshop";
import type { WorkshopFilters } from "@/lib/filters";

export function supplierFinance(data: WorkshopData, f: WorkshopFilters) {
  // Supplier debt is filtered after aggregation, never as a vehicle-debt filter.
  const items = selectPurchases(data, { ...f, balance: "" });
  const cost = sumMoney(items.map(purchaseCost));
  const paid = sumMoney(
    items.map((p) => paidFor(data.cash, "SUPPLIER_PURCHASE", p.id)),
  );
  return { items, cost, paid, remaining: subtractMoney(cost, paid) };
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
