import Link from "next/link";
import { deletePurchaseAction } from "@/app/actions/purchases";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PurchaseEntry } from "@/components/purchase-entry";
import {
  partTitle,
  supplierDisplayName,
  workerDisplayName,
  type DbPurchase,
} from "@/lib/supabase/queries";
import type { WorkshopData } from "@/lib/supabase/workshop";
import { paidFor, purchaseCost, subtractMoney } from "@/lib/workshop";
import { formatMoney, formatDate } from "@/lib/format";
import { reportPaymentLabels } from "@/lib/reports/report-format";
import { StatusBadge } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { formatQuantity } from "@/lib/decimal";
export function PurchaseList({
  data,
  items,
  editable = false,
}: {
  data: WorkshopData;
  items: DbPurchase[];
  editable?: boolean;
}) {
  return (
    <div className="divide-y divide-[var(--border)]">
      {!items.length ? <EmptyState>Alış tapılmadı.</EmptyState> : null}
      {items.map((p) => {
        const job = data.jobs.find((j) => j.id === p.service_job_id),
          part = data.parts.find((r) => r.id === p.required_part_id),
          paid = paidFor(data.cash, "SUPPLIER_PURCHASE", p.id),
          cost = purchaseCost(p);
        return (
          <article key={p.id} className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{partTitle(p)}</h3>
              {part?.is_additional || !p.required_part_id ? (
                <span className="text-xs text-[var(--accent)]">Əlavə alış</span>
              ) : null}
              <Link
                className="font-mono text-[var(--accent)]"
                href={`/vehicles/${p.service_job_id}`}
              >
                {job?.vehicles?.plate} · {job?.vehicles?.make}{" "}
                {job?.vehicles?.model}
              </Link>
            </div>
            <dl className="metric-grid my-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3 xl:grid-cols-4">
              {[
                ["Tarix", formatDate(p.purchase_date)],
                [
                  "Miqdar / vahid",
                  `${formatQuantity(part?.quantity ?? p.quantity)} ${part?.unit_catalog?.name ?? "Ədəd"}`,
                ],
                [
                  "Müştəri qiyməti",
                  part
                    ? formatMoney(part.quoted_price)
                    : "Məlumat daxil edilməyib",
                ],
                ["Maya", formatMoney(cost)],
                ["Ödənilib", formatMoney(paid)],
                [
                  "Təchizatçı borcu",
                  formatMoney(
                    p.source_type === "SUPPLIER"
                      ? subtractMoney(cost, paid)
                      : 0,
                  ),
                ],
                ["Ödəniş", reportPaymentLabels[p.payment_status]],
                [
                  "Mənbə",
                  p.source_type === "SUPPLIER"
                    ? supplierDisplayName(p.suppliers)
                    : p.source_type === "CUSTOMER_PROVIDED"
                      ? "Müştərinin detalı"
                      : "Daxili ehtiyat",
                ],
                [
                  "Alan",
                  p.purchased_by_admin
                    ? "Administrator"
                    : workerDisplayName(p.workers),
                ],
                [
                  "Qaimə / OEM",
                  [p.document_no, p.part_code_oem]
                    .filter(Boolean)
                    .join(" / ") || "-",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[var(--muted)]">{k}</dt>
                  <dd className="mt-1 break-words">
                    {k === "Ödəniş" ? (
                      <StatusBadge
                        tone={
                          p.payment_status === "PAID" ? "success" : "warning"
                        }
                      >
                        {v}
                      </StatusBadge>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {p.notes ? (
              <p className="mb-3 break-words text-sm text-[var(--muted)]">
                {p.notes}
              </p>
            ) : null}
            {editable ? (
              <details>
                <summary className="cursor-pointer text-sm text-[var(--accent)]">
                  Alışı redaktə et
                </summary>
                <div className="mt-4">
                  <PurchaseEntry
                    jobId={p.service_job_id}
                    part={part}
                    purchase={p}
                    suppliers={data.suppliers
                      .filter((s) => s.active || s.id === p.supplier_id)
                      .map((s) => ({
                        id: s.id,
                        name: supplierDisplayName(s),
                      }))}
                    workers={data.workers.map((w) => ({
                      id: w.id,
                      name: workerDisplayName(w),
                    }))}
                  />
                </div>
                {paid === 0 ? (
                  <ActionForm action={deletePurchaseAction} className="mt-3">
                    <input name="id" type="hidden" value={p.id} />
                    <SubmitButton variant="danger">Alışı ləğv et</SubmitButton>
                  </ActionForm>
                ) : null}
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
