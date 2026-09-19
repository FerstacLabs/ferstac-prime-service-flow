import {
  recordPaymentAction,
  setWorkerCostAction,
  voidPaymentAction,
} from "@/app/actions/finance";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ReportActions } from "@/components/report-actions";
import {
  workTitle,
  workerDisplayName,
  partTitle,
  supplierDisplayName,
  type DbServiceJob,
  type DbWorkItem,
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
export function MoneyGrid({
  items,
}: {
  items: Array<[string, number | null | undefined]>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 py-4 text-sm md:grid-cols-3 xl:grid-cols-4">
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
    <details className="mt-3">
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
          <input
            name="amount"
            type="number"
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
          <input name="notes" maxLength={250} className="field mt-1" />
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
export function WorkerCostForm({
  work,
  paid,
}: {
  work: DbWorkItem;
  paid: number;
}) {
  return (
    <ActionForm
      action={setWorkerCostAction}
      className="mt-4 flex max-w-lg flex-wrap items-end gap-3"
    >
      <input type="hidden" name="id" value={work.id} />
      <label className="text-xs text-[var(--muted)]">
        Usta maya dəyəri
        <input
          name="labor_cost"
          type="number"
          min={paid}
          step="0.01"
          required
          defaultValue={costKnown(work) ? work.labor_cost : ""}
          className="field mt-1"
        />
      </label>
      <SubmitButton variant="secondary" pendingText="Saxlanır...">
        Mayanı saxla
      </SubmitButton>
    </ActionForm>
  );
}
export function JobFinance({
  job,
  data,
  editable = false,
}: {
  job: DbServiceJob;
  data: WorkshopData;
  editable?: boolean;
}) {
  const work = data.work.filter((w) => w.service_job_id === job.id),
    parts = data.parts.filter((p) => p.service_job_id === job.id),
    purchases = data.purchases.filter((p) => p.service_job_id === job.id),
    n = jobFinance(job, work, parts, purchases, data.cash);
  return (
    <>
      <FinanceSummary job={job} data={data} />
      <div className="my-5 flex flex-wrap gap-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Qiymət təklifi</h2>
          <ReportActions report="quotation" query={`job=${job.id}`} />
        </div>
      </div>
      {!n.detailed && editable ? (
        <PaymentForm
          job={job.id}
          type="CUSTOMER_BUDGET"
          target=""
          remaining={n.customerReceivable}
        />
      ) : null}
      <section className="mt-6">
        <h2 className="border-b border-[var(--border)] pb-3 text-lg font-semibold">
          İşlər: müştəri və usta
        </h2>
        {work.map((w) => {
          const received = paidFor(data.cash, "CUSTOMER_WORK", w.id),
            worker = workerWorkFinance(w, data.cash);
          return (
            <article
              key={w.id}
              id={`work-${w.id}`}
              className="border-b border-[var(--border)] py-5"
            >
              <h3 className="font-semibold">{workTitle(w)}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {workerDisplayName(w.workers)} · {statusLabels[w.status]} ·{" "}
                {formatDate(w.planned_at)}
              </p>
              <MoneyGrid
                items={[
                  ["Müştəri qiyməti", w.quoted_price],
                  ["Müştəridən alınıb", received],
                  [
                    "Müştəri qalığı",
                    w.quoted_price != null
                      ? subtractMoney(w.quoted_price, received)
                      : null,
                  ],
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
                  Usta mayası daxil edilməyib
                </p>
              ) : null}
              {w.notes ? (
                <p className="break-words text-sm text-[var(--muted)]">
                  {w.notes}
                </p>
              ) : null}
              {editable ? (
                <>
                  <WorkerCostForm work={w} paid={worker.paid} />
                  {w.quoted_price != null ? (
                    <PaymentForm
                      job={job.id}
                      type="CUSTOMER_WORK"
                      target={w.id}
                      remaining={subtractMoney(w.quoted_price, received)}
                    />
                  ) : null}
                  {worker.canPay ? (
                    <PaymentForm
                      job={job.id}
                      type="WORKER_WORK_ITEM"
                      target={w.id}
                      remaining={worker.remaining ?? 0}
                    />
                  ) : null}
                </>
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
            cost = sumMoney(matches.map(purchaseCost)),
            received = paidFor(data.cash, "CUSTOMER_PART", r.id);
          return (
            <article
              key={r.id}
              className="border-b border-[var(--border)] py-5"
            >
              <h3 className="font-semibold">{r.part_catalog?.name}</h3>
              <MoneyGrid
                items={[
                  ["Müştəri qiyməti", r.quoted_price],
                  ["Müştəridən alınıb", received],
                  ["Müştəri qalığı", subtractMoney(r.quoted_price, received)],
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
              {editable ? (
                <PaymentForm
                  job={job.id}
                  type="CUSTOMER_PART"
                  target={r.id}
                  remaining={subtractMoney(r.quoted_price, received)}
                />
              ) : null}
              {matches.map((p) => (
                <PurchaseBalance
                  key={p.id}
                  purchase={p}
                  data={data}
                  editable={editable}
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
              <PurchaseBalance purchase={p} data={data} editable={editable} />
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
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
              <th className="py-3" key={i}>
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
                <td className="py-3">{formatDate(t.transaction_date)}</td>
                <td className="font-mono">{job?.vehicles?.plate}</td>
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
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }
                >
                  {t.direction === "IN" ? "+" : "-"}
                  {formatMoney(t.amount)}
                </td>
                <td className="max-w-60 break-words">
                  {t.notes}
                  {t.voided_at ? <p>Ləğv: {t.void_reason}</p> : null}
                </td>
                <td>
                  {editable && !t.voided_at ? (
                    <details>
                      <summary className="cursor-pointer">Ləğv et</summary>
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
                          variant="secondary"
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
      {!cash.length ? (
        <p className="py-5 text-[var(--muted)]">Ödəniş yoxdur.</p>
      ) : null}
    </div>
  );
}
