import { recordPaymentAction, voidPaymentAction } from "@/app/actions/finance";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ReportActions } from "@/components/report-actions";
import {
  workTitle,
  workerDisplayName,
  partTitle,
  supplierDisplayName,
  type DbServiceJob,
} from "@/lib/supabase/queries";
import type { WorkshopData } from "@/lib/supabase/workshop";
import {
  jobFinance,
  paidFor,
  purchaseCost,
  costKnown,
  sumMoney,
  subtractMoney,
  missingValue,
  missingCostDescription,
  allocationLabels,
  type AllocationType,
  type CashTransaction,
} from "@/lib/workshop";
import { bakuDate } from "@/lib/filters";
import { formatMoney, formatDate } from "@/lib/format";
import { statusLabels } from "@/components/app-shell";
import { workerWorkFinance } from "@/lib/worker-finance";
import { EmptyState } from "@/components/empty-state";
import { DecimalInput } from "@/components/decimal-input";
export function MoneyGrid({
  items,
}: {
  items: Array<[string, number | null | undefined]>;
}) {
  return (
    <dl className="metric-grid money-grid grid grid-cols-2 gap-x-5 py-4 text-sm md:grid-cols-3 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="mt-1 font-semibold">
            {value == null ? missingValue : formatMoney(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function FinanceSummary({
  job,
  data,
}: {
  job: DbServiceJob;
  data: WorkshopData;
}) {
  const n = jobFinance(job, data.work, data.parts, data.purchases, data.cash);
  const missing = missingCostDescription(n);
  return (
    <section className="border-y border-[var(--border)] py-3">
      <h2 className="text-lg font-semibold">Maliyyə yekunu</h2>
      <MoneyGrid
        items={[
          ["Müştəriyə deyilən işçilik", n.detailed ? n.quotedWork : null],
          ["Müştəriyə deyilən detallar", n.detailed ? n.quotedParts : null],
          [n.detailed ? "Ümumi təklif" : "Əvvəlki büdcə", n.quotedTotal],
          ["Razılaşdırılmış ümumi büdcə", job.agreed_budget],
          ["Faktiki detal mayası", n.partsCost],
          ["Məlum usta mayası", n.workCost],
          ["Ümumi məlum maya", n.totalCost],
          ["Müştəridən alınıb", n.customerPaid],
          ["Müştərinin qalıq borcu", n.customerReceivable],
          ["Təchizatçıya borc", n.supplierPayable],
          ["Ustaya qazanılmış borc", n.workerPayable],
          ["Usta avansı", n.workerAdvance],
          ["Qalan razılaşdırılmış usta məbləği", n.workerRemaining],
          [
            "Ümumi ödəniləcək borc",
            sumMoney([n.supplierPayable, n.workerPayable]),
          ],
          ["Aktiv işlərin razılaşdırılmış usta məbləği", n.workerExpected],
          ["İşçilik mənfəəti", n.workProfit],
          ["Detal mənfəəti", n.partProfit],
          ["Ümumi brüt mənfəət", n.grossProfit],
        ]}
      />
      {missing ? (
        <p className="pb-3 text-sm text-[var(--warning)]">
          Maya daxil edilməyib: {missing}.
        </p>
      ) : null}
      {!n.detailed ? (
        <p className="pb-3 text-sm text-[var(--warning)]">
          Əvvəlki kartda sətir qiymətləri yoxdur; mənfəət hesablanmayıb.
        </p>
      ) : null}
    </section>
  );
}
export function PaymentForm({
  job,
  type,
  target,
  remaining,
  label,
}: {
  job: string;
  type: AllocationType;
  target: string;
  remaining: number;
  label?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <details className="payment-details mt-3">
      <summary className="cursor-pointer text-sm text-[var(--accent)]">
        {label ?? allocationLabels[type]}
      </summary>
      <ActionForm
        action={recordPaymentAction}
        className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input name="service_job_id" type="hidden" value={job} />
        <input name="allocation_type" type="hidden" value={type} />
        <input name="target_id" type="hidden" value={target} />
        <label className="text-xs text-[var(--muted)]">
          Ödəniş məbləği (AZN)
          <DecimalInput
            name="amount"
            required
            min="0.01"
            step="0.01"
            max={remaining}
            className="field mt-1"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Tarix
          <input
            name="transaction_date"
            type="date"
            required
            defaultValue={bakuDate()}
            className="field mt-1"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Qeyd
          <textarea
            name="notes"
            rows={2}
            maxLength={250}
            className="field mt-1"
          />
        </label>
        <SubmitButton pendingText="Qeydə alınır...">
          {type === "WORKER_WORK_ITEM"
            ? "Ustaya ödəniş et"
            : "Ödənişi qeydə al"}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
export function JobFinance({
  job,
  data,
  editable = false,
  showQuotation = true,
}: {
  job: DbServiceJob;
  data: WorkshopData;
  editable?: boolean;
  showQuotation?: boolean;
}) {
  const work = data.work.filter((w) => w.service_job_id === job.id),
    parts = data.parts.filter((p) => p.service_job_id === job.id),
    purchases = data.purchases.filter((p) => p.service_job_id === job.id);
  return (
    <>
      <FinanceSummary job={job} data={data} />
      {showQuotation ? (
        <div className="my-5 flex flex-wrap gap-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Qiymət təklifi</h2>
            <ReportActions report="quotation" query={`job=${job.id}`} />
          </div>
        </div>
      ) : null}
      {editable ? (
        <Link href={`/kassa?job=${job.id}`} className="btn btn-secondary">
          Avtomobil üzrə hesablaşma
        </Link>
      ) : null}
      <section className="mt-6">
        <h2 className="border-b border-[var(--border)] pb-3 text-lg font-semibold">
          İşlər: müştəri və usta
        </h2>
        {work.map((w) => {
          const worker = workerWorkFinance(w, data.cash);
          return (
            <article
              key={w.id}
              id={`work-${w.id}`}
              className="cash-work-item border-b border-[var(--border)] py-5"
            >
              <h3 className="font-semibold">{workTitle(w)}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {workerDisplayName(w.workers)} · {statusLabels[w.status]} ·{" "}
                {formatDate(w.planned_at)}
              </p>
              <MoneyGrid
                items={[
                  ["Müştəri qiyməti", w.quoted_price],
                  ["Usta mayası", costKnown(w) ? w.labor_cost : null],
                  ["Qazanılmış", worker.earned],
                  ["Ustaya ödənilib", worker.paid],
                  ["Avans", worker.advance],
                  ["Qazanılmış qalıq", worker.outstanding],
                  ["Qalan razılaşdırılmış usta məbləği", worker.remaining],
                  [
                    "İş mənfəəti",
                    w.quoted_price != null && costKnown(w)
                      ? subtractMoney(
                          w.quoted_price,
                          w.status === "CANCELLED" ? 0 : w.labor_cost,
                        )
                      : null,
                  ],
                ]}
              />
              {!worker.known ? (
                <p className="text-sm text-[var(--warning)]">
                  Usta maya dəyəri daxil edilməyib
                </p>
              ) : null}
              {w.notes ? (
                <p className="break-words text-sm text-[var(--muted)]">
                  {w.notes}
                </p>
              ) : null}
            </article>
          );
        })}
      </section>
      <section className="mt-6">
        <h2 className="border-b border-[var(--border)] pb-3 text-lg font-semibold">
          Detallar: müştəri və təchizatçı
        </h2>
        {parts.map((r) => {
          const matches = purchases.filter((p) => p.required_part_id === r.id),
            cost = sumMoney(matches.map(purchaseCost));
          return (
            <article
              key={r.id}
              className="border-b border-[var(--border)] py-5"
            >
              <h3 className="font-semibold">{r.part_catalog?.name}</h3>
              <MoneyGrid
                items={[
                  ["Müştəri qiyməti", r.quoted_price],
                  ["Faktiki maya", matches.length ? cost : null],
                  [
                    "Detal mənfəəti",
                    matches.length ? subtractMoney(r.quoted_price, cost) : null,
                  ],
                ]}
              />
              {!matches.length ? (
                <p className="text-sm text-[var(--warning)]">
                  Alınmalıdır · Maya daxil edilməyib
                </p>
              ) : null}
              {r.notes ? (
                <p className="break-words text-sm text-[var(--muted)]">
                  {r.notes}
                </p>
              ) : null}
              {matches.map((p) => (
                <PurchaseBalance
                  key={p.id}
                  purchase={p}
                  data={data}
                  editable={false}
                />
              ))}
            </article>
          );
        })}
        {purchases
          .filter((p) => !p.required_part_id)
          .map((p) => (
            <article
              key={p.id}
              className="border-b border-[var(--border)] py-4"
            >
              <h3>{partTitle(p)}</h3>
              <PurchaseBalance purchase={p} data={data} editable={false} />
            </article>
          ))}
      </section>
    </>
  );
}
function PurchaseBalance({
  purchase: p,
  data,
  editable,
}: {
  purchase: WorkshopData["purchases"][number];
  data: WorkshopData;
  editable: boolean;
}) {
  const paid = paidFor(data.cash, "SUPPLIER_PURCHASE", p.id),
    remaining =
      p.source_type === "SUPPLIER" ? subtractMoney(purchaseCost(p), paid) : 0;
  return (
    <div className="mt-3">
      <p className="text-sm text-[var(--muted)]">
        {p.source_type === "SUPPLIER"
          ? supplierDisplayName(p.suppliers)
          : p.source_type === "CUSTOMER_PROVIDED"
            ? "Müştərinin təqdim etdiyi detal"
            : "Servis daxili ehtiyat"}{" "}
        · {formatDate(p.purchase_date)} · {p.document_no || "Qaimə yoxdur"} ·{" "}
        {p.part_code_oem || "OEM yoxdur"}
      </p>
      <MoneyGrid
        items={[
          ["Alış mayası", purchaseCost(p)],
          ["Təchizatçıya ödənilib", paid],
          ["Təchizatçı borcu", remaining],
        ]}
      />
      {p.notes ? <p className="break-words text-sm">{p.notes}</p> : null}
      {editable && p.source_type === "SUPPLIER" ? (
        <PaymentForm
          job={p.service_job_id}
          type="SUPPLIER_PURCHASE"
          target={p.id}
          remaining={remaining}
        />
      ) : null}
    </div>
  );
}
export function CashHistory({
  cash,
  data,
  editable = false,
}: {
  cash: CashTransaction[];
  data: WorkshopData;
  editable?: boolean;
}) {
  if (!cash.length) return <EmptyState>Ödəniş yoxdur.</EmptyState>;
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Kassa ödəniş tarixçəsi"
      tabIndex={0}
    >
      <table className="data-table w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="text-[var(--muted)]">
            {[
              "Tarix",
              "Avtomobil",
              "Əməliyyat / sətir",
              "Məbləğ",
              "Qeyd",
              "",
            ].map((s, i) => (
              <th scope="col" className={i === 3 ? "numeric" : ""} key={i}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cash.map((t) => {
            const job = data.jobs.find((j) => j.id === t.service_job_id),
              work = data.work.find((w) => w.id === t.work_item_id),
              part = data.parts.find((p) => p.id === t.required_part_id),
              purchase = data.purchases.find((p) => p.id === t.purchase_id);
            return (
              <tr
                key={t.id}
                className={`border-t border-[var(--border)] ${t.voided_at ? "opacity-60" : ""}`}
              >
                <td className="date-cell">{formatDate(t.transaction_date)}</td>
                <td className="whitespace-nowrap font-mono">
                  {job?.vehicles?.plate}
                </td>
                <td>
                  {allocationLabels[t.allocation_type]}
                  <div className="text-xs text-[var(--muted)]">
                    {work
                      ? workTitle(work)
                      : (part?.part_catalog?.name ??
                        (purchase ? partTitle(purchase) : job?.job_no))}
                  </div>
                </td>
                <td
                  className={
                    t.direction === "IN"
                      ? "numeric text-[var(--success)]"
                      : "numeric text-[var(--warning)]"
                  }
                >
                  {t.direction === "IN" ? "+" : "-"}
                  {formatMoney(t.amount)}
                </td>
                <td className="note-cell">
                  {t.notes}
                  {t.voided_at ? <p>Ləğv: {t.void_reason}</p> : null}
                </td>
                <td>
                  {editable && !t.voided_at ? (
                    <details>
                      <summary className="cursor-pointer whitespace-nowrap text-[var(--danger)]">
                        Ləğv et
                      </summary>
                      <ActionForm
                        action={voidPaymentAction}
                        className="mt-2 grid gap-2"
                      >
                        <input name="id" type="hidden" value={t.id} />
                        <input
                          name="void_reason"
                          aria-label="Ləğv səbəbi"
                          placeholder="Ləğv səbəbi"
                          maxLength={250}
                          required
                          className="field"
                        />
                        <SubmitButton
                          variant="danger"
                          pendingText="Ləğv edilir..."
                        >
                          Ləğvi təsdiqlə
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
