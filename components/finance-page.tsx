import Link from "next/link";
import { MasterLifecycle } from "@/components/master-lifecycle";
import { financialCategoryLabel } from "@/lib/finance-labels";
import {
  channelName,
  filterLedger,
  journalFilters,
  ledgerBalance,
  movementTotals,
  vehicleSettlement,
  moneySum,
  moneyDiff,
  type FinanceData,
} from "@/lib/finance";
import { formatMoney, formatDate } from "@/lib/format";
import { bakuDate, type SearchParams } from "@/lib/filters";
import { PageHeader } from "@/components/app-shell";
import { MoneyGrid } from "@/components/job-finance";
import {
  NewMovement,
  SettlementDialog,
  TransferForm,
} from "@/components/finance-forms";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import {
  saveFinancialMasterAction,
  reopenVehicleAction,
} from "@/app/actions/ledger";
import { voidPaymentAction } from "@/app/actions/finance";
import { ReportActions } from "@/components/report-actions";
import { SupplierCreditActions } from "@/components/purchase-lifecycle-forms";
import { financeReport } from "@/lib/reports/finance-report";
import {
  WorkerAdvanceButton,
  AdvanceAllocationButton,
} from "@/components/worker-advance-forms";
export function FinancePage({
  data,
  params,
  admin,
}: {
  data: FinanceData;
  params: SearchParams;
  admin: boolean;
}) {
  const f = journalFilters(params),
    view =
      typeof params.view === "string" &&
      ["settlement", "workers", "accounts", "categories", "reports"].includes(
        params.view,
      )
        ? params.view
        : "operations";
  const settlementJob =
    typeof params.settlementJob === "string" ? params.settlementJob : "";
  const reconciliation =
    view === "workers" && (f.reportType === "supplier" ? f.supplier : f.worker)
      ? financeReport(
          data,
          journalFilters({
            reportType: f.reportType === "supplier" ? "supplier" : "worker",
            supplier: f.reportType === "supplier" ? f.supplier : "",
            worker: f.reportType === "supplier" ? "" : f.worker,
            job: f.job,
            from: f.from,
            to: f.to,
          }),
        )
      : null;
  const listView = ["operations", "reports"].includes(view);
  const resetQuery = new URLSearchParams({
    view,
    ...(settlementJob ? { settlementJob } : {}),
  }).toString();
  const rows = filterLedger(data, f),
    cash = movementTotals(
      rows.filter((t) => t.channel === "CASH"),
      view !== "reports",
    ),
    bank = movementTotals(
      rows.filter((t) => t.channel === "BANK"),
      view !== "reports",
    ),
    total = movementTotals(rows, view !== "reports"),
    selected =
      view === "settlement"
        ? data.jobs.find((j) => j.id === settlementJob)
        : undefined,
    query = new URLSearchParams(
      Object.entries(f).filter(([, v]) => v),
    ).toString();
  const start = f.from || bakuDate(),
    end = f.to || bakuDate(),
    period = data.ledger.filter(
      (t) =>
        (!f.channel || t.channel === f.channel) &&
        (!f.account || t.financial_account_id === f.account),
    ),
    opening = ledgerBalance(period.filter((t) => t.transaction_date < start)),
    periodFlow = movementTotals(
      period.filter(
        (t) => t.transaction_date >= start && t.transaction_date <= end,
      ),
      false,
    );
  const select = (
    name: string,
    label: string,
    options: { id: string; name: string }[],
  ) => (
    <label className="text-xs text-[var(--muted)]">
      {label}
      <select
        name={name}
        defaultValue={
          name === "reportType" && view === "workers"
            ? f.reportType || "worker"
            : f[name as keyof typeof f]
        }
        className="field mt-1"
      >
        {name !== "reportType" || view !== "workers" ? (
          <option value="">Hamısı</option>
        ) : null}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <PageHeader
        title="Kassa"
        eyebrow="Pul hərəkətləri və hesablaşma"
        actions={
          view === "reports" ? (
            <ReportActions report="finance" query={query} />
          ) : undefined
        }
      />
      <nav
        aria-label="Maliyyə bölmələri"
        className="mb-5 flex flex-wrap gap-4 border-b border-[var(--border)] pb-3"
      >
        {[
          ["operations", "Əməliyyatlar"],
          ["settlement", "Avtomobil hesablaşması"],
          ["workers", "Hesablaşma"],
          ...(admin
            ? [
                ["accounts", "Bank hesabları"],
                ["categories", "Təyinatlar"],
              ]
            : []),
          ["reports", "Hesabatlar"],
        ].map(([key, title]) => (
          <Link
            key={key}
            href={`/kassa?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")), view: key })}`}
            aria-current={view === key ? "page" : undefined}
            className={
              view === key
                ? "font-semibold text-[var(--accent)]"
                : "text-[var(--muted)]"
            }
          >
            {title}
          </Link>
        ))}
      </nav>
      {view === "operations" ? (
        <>
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">Cari vəsait</h2>
            <MoneyGrid
              items={[
                [
                  "Nağd qalıq",
                  ledgerBalance(
                    data.ledger.filter((t) => t.channel === "CASH"),
                  ),
                ],
                ...data.accounts
                  .filter((a) => !a.deleted_at)
                  .map(
                    (a) =>
                      [
                        a.name + (a.active ? "" : " (arxiv)"),
                        ledgerBalance(
                          data.ledger.filter(
                            (t) => t.financial_account_id === a.id,
                          ),
                        ),
                      ] as [string, number],
                  ),
                ["Ümumi vəsait", ledgerBalance(data.ledger)],
              ]}
            />
          </section>
          <div className="mb-6 flex flex-wrap gap-3">
            <NewMovement data={data} direction="IN" channel="CASH" />
            <NewMovement data={data} direction="OUT" channel="CASH" />
            <TransferForm accounts={data.accounts} />
            {admin ? (
              <NewMovement data={data} direction="IN" channel="CASH" opening />
            ) : null}
          </div>
        </>
      ) : null}
      {listView ? (
        <>
          <form
            key={query}
            className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <input type="hidden" name="view" value={view} />
            {view === "reports"
              ? select("reportType", "Hesabat növü", [
                  { id: "ledger", name: "Mədaxil / Məxaric jurnalı" },
                  { id: "opening", name: "Başlanğıc qalıqlar" },
                ])
              : null}
            {settlementJob ? (
              <input type="hidden" name="settlementJob" value={settlementJob} />
            ) : null}
            {[
              ["from", "Başlanğıc"],
              ["to", "Son"],
            ].map(([name, label]) => (
              <label key={name} className="text-xs text-[var(--muted)]">
                {label}
                <input
                  type="date"
                  name={name}
                  defaultValue={f[name as "from" | "to"]}
                  className="field mt-1"
                />
              </label>
            ))}
            {listView
              ? select("channel", "Kanal", [
                  { id: "CASH", name: "Nağd" },
                  { id: "BANK", name: "Bank" },
                ])
              : null}
            {select("direction", "İstiqamət", [
              { id: "IN", name: "Mədaxil" },
              { id: "OUT", name: "Məxaric" },
            ])}
            {select("account", "Bank hesabı", data.accounts)}
            {select("category", "Təyinat", data.categories)}
            {select(
              "job",
              "Avtomobil",
              data.jobs.map((j) => ({
                id: j.id,
                name: `${j.plate} · ${j.job_no}`,
              })),
            )}
            {select(
              "supplier",
              "Təchizatçı",
              Array.from(
                new Map(
                  data.purchases
                    .filter((p) => p.supplier_id)
                    .map((p) => [
                      p.supplier_id!,
                      { id: p.supplier_id!, name: p.supplier },
                    ]),
                ).values(),
              ),
            )}
            {select(
              "worker",
              "İşçi",
              Array.from(
                new Map(
                  (
                    data.workers ??
                    data.work
                      .filter((w) => w.worker_id)
                      .map((w) => ({ id: w.worker_id!, name: w.worker }))
                  ).map((w) => [w.id, { id: w.id, name: w.name }]),
                ).values(),
              ),
            )}
            {select(
              "actor",
              "Daxil edən",
              Array.from(
                new Map(
                  data.ledger.map((t) => [
                    t.owner_user_id,
                    { id: t.owner_user_id, name: t.created_by_name || "-" },
                  ]),
                ).values(),
              ),
            )}
            <label className="text-xs text-[var(--muted)]">
              Tərəf
              <input
                name="party"
                defaultValue={f.party}
                className="field mt-1"
              />
            </label>
            <div className="flex items-end gap-2">
              <button className="btn btn-primary">Tətbiq et</button>
              <Link className="btn btn-secondary" href={`/kassa?${resetQuery}`}>
                Sıfırla
              </Link>
            </div>
          </form>
          <MoneyGrid
            items={[
              ["Nağd mədaxil", cash.income],
              ["Nağd məxaric", cash.expense],
              ["Nağd net", cash.net],
              ["Bank mədaxil", bank.income],
              ["Bank məxaric", bank.expense],
              ["Bank net", bank.net],
              ["Ümumi mədaxil", total.income],
              ["Ümumi məxaric", total.expense],
              ["Net pul axını", total.net],
            ]}
          />
        </>
      ) : null}
      {view === "reports" &&
      (f.account || f.channel === "CASH") &&
      !f.worker &&
      !f.supplier &&
      !f.job &&
      !f.category &&
      !f.direction &&
      !f.party &&
      !f.actor &&
      f.reportType !== "opening" ? (
        <section className="my-6">
          <h2 className="text-lg font-semibold">
            {start === end
              ? `Gündəlik qalıq · ${start}`
              : `Dövr qalığı · ${start} / ${end}`}
          </h2>
          <MoneyGrid
            items={[
              ["Əvvəl qalıq", opening],
              ["Mədaxil (köçürmələr daxil)", periodFlow.income],
              ["Məxaric (köçürmələr daxil)", periodFlow.expense],
              ["Son qalıq", moneySum([opening, periodFlow.net])],
            ]}
          />
        </section>
      ) : null}
      {view === "settlement" ? (
        <>
          <form
            key={settlementJob}
            className="my-5 flex flex-wrap items-end gap-3"
          >
            {Object.entries(params)
              .filter(
                ([key, value]) =>
                  key !== "settlementJob" &&
                  key !== "view" &&
                  typeof value === "string",
              )
              .map(([key, value]) => (
                <input
                  key={key}
                  type="hidden"
                  name={key}
                  value={String(value)}
                />
              ))}
            <input type="hidden" name="view" value="settlement" />
            <label className="min-w-0 flex-1 text-sm">
              Avtomobil / servis kartı
              <select
                name="settlementJob"
                defaultValue={settlementJob}
                required
                className="field mt-1"
              >
                <option value="">Seçin</option>
                {data.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.plate} · {j.job_no}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary">Seç</button>
          </form>
          {selected ? (
            <section className="my-8 border-y border-[var(--border)] py-5">
              <h2 className="text-lg font-semibold">
                {selected.plate} · {selected.model}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selected.customer_name} · {selected.job_no}
              </p>
              <MoneyGrid
                items={[
                  [
                    selected.customer_due < 0
                      ? "Müştəri artıq ödənişi"
                      : "Müştəri qalıq borcu",
                    Math.abs(selected.customer_due),
                  ],
                  [
                    "Müştəridən alınıb",
                    moneySum(
                      data.ledger
                        .filter(
                          (t) =>
                            t.service_job_id === selected.id &&
                            t.allocation_type.startsWith("CUSTOMER_") &&
                            !t.voided_at,
                        )
                        .map((t) => t.amount),
                    ),
                  ],
                  [
                    "Məlum maya",
                    vehicleSettlement(data, selected.id).totalCost,
                  ],
                  [
                    "Qalan öhdəlik",
                    vehicleSettlement(data, selected.id).remaining,
                  ],
                  [
                    "Artıq ödəniş / uzlaşdırılacaq",
                    vehicleSettlement(data, selected.id).overpaid,
                  ],
                ]}
              />
              {selected.inactive ? (
                <p className="text-[var(--muted)]">Arxiv servis kartı</p>
              ) : selected.closed_at ? (
                <>
                  <p className="mb-3 text-[var(--success)]">Maliyyə bağlanıb</p>
                  {admin ? (
                    <ActionForm
                      action={reopenVehicleAction}
                      className="flex flex-wrap gap-3"
                    >
                      <input
                        type="hidden"
                        name="service_job_id"
                        value={selected.id}
                      />
                      <input
                        name="reason"
                        required
                        maxLength={250}
                        placeholder="Yenidən açılma səbəbi"
                        aria-label="Yenidən açılma səbəbi"
                        className="field max-w-md"
                      />
                      <SubmitButton>Yenidən aç</SubmitButton>
                    </ActionForm>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {selected.customer_due > 0 ? (
                    <NewMovement
                      key={`payment-${selected.id}`}
                      data={data}
                      direction="IN"
                      channel="CASH"
                      job={selected}
                    />
                  ) : null}
                  <SettlementDialog
                    key={`settlement-${selected.id}`}
                    data={data}
                    job={selected}
                  />
                </div>
              )}
            </section>
          ) : (
            <section className="my-6">
              <h2 className="mb-3 text-lg font-semibold">
                Avtomobil balansları
              </h2>
              <div className="table-scroll">
                <table className="data-table w-full min-w-[640px] text-sm">
                  <thead>
                    <tr>
                      <th>Avtomobil</th>
                      <th>Müştəri</th>
                      <th>Müştəri borcu</th>
                      <th>Qalan öhdəlik</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <Link
                            className="text-[var(--accent)]"
                            href={`/kassa?view=settlement&settlementJob=${j.id}`}
                          >
                            {j.plate}
                          </Link>
                        </td>
                        <td>{j.customer_name}</td>
                        <td>{formatMoney(j.customer_due)}</td>
                        <td>
                          {formatMoney(vehicleSettlement(data, j.id).remaining)}
                        </td>
                        <td>{j.closed_at ? "Maliyyə bağlanıb" : "Açıq"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
      {view === "workers" ? (
        <section className="my-6">
          <h2 className="mb-3 text-lg font-semibold">Hesablaşma</h2>
          <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="view" value="workers" />
            {select("reportType", "Hesablaşma növü", [
              { id: "worker", name: "İşçi / Usta" },
              { id: "supplier", name: "Təchizatçı" },
            ])}
            {select("worker", "İşçi", data.workers ?? [])}
            {select(
              "supplier",
              "Təchizatçı",
              Array.from(
                new Map(
                  data.purchases
                    .filter((p) => p.supplier_id)
                    .map((p) => [
                      p.supplier_id!,
                      { id: p.supplier_id!, name: p.supplier },
                    ]),
                ).values(),
              ),
            )}
            {select(
              "job",
              "Avtomobil",
              data.jobs.map((j) => ({ id: j.id, name: j.plate })),
            )}
            {[
              ["from", "Başlanğıc tarix"],
              ["to", "Son tarix"],
            ].map(([name, label]) => (
              <label key={name} className="text-sm">
                {label}
                <input
                  className="field mt-1"
                  type="date"
                  name={name}
                  defaultValue={f[name as "from" | "to"]}
                />
              </label>
            ))}
            <div className="flex items-end gap-2">
              <button className="btn btn-primary">Tətbiq et</button>
              <Link className="btn btn-secondary" href="/kassa?view=workers">
                Sıfırla
              </Link>
            </div>
          </form>
          {f.reportType === "supplier" ? (
            f.supplier ? (
              <div className="mb-5">
                <ReportActions
                  report="finance"
                  query={new URLSearchParams({
                    reportType: "supplier",
                    supplier: f.supplier,
                    job: f.job,
                    from: f.from,
                    to: f.to,
                  }).toString()}
                />
              </div>
            ) : null
          ) : f.worker ? (
            <div className="mb-5">
              <ReportActions
                report="finance"
                query={new URLSearchParams({
                  reportType: "worker",
                  worker: f.worker,
                  job: f.job,
                  from: f.from,
                  to: f.to,
                }).toString()}
              />
            </div>
          ) : null}
          {f.reportType === "supplier" ? (
            <div className="divide-y divide-[var(--border)]">
              {reconciliation ? (
                <dl className="metric-grid my-5 grid grid-cols-2 gap-4 text-sm xl:grid-cols-4">
                  {reconciliation.summary.map((s) => (
                    <div key={s.label}>
                      <dt className="text-[var(--muted)]">{s.label}</dt>
                      <dd className="mt-1 font-semibold">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {(data.purchaseReturns ?? [])
                .filter(
                  (r) =>
                    (!f.supplier || r.supplier_id === f.supplier) &&
                    (!f.job || r.service_job_id === f.job) &&
                    Number(r.available) > 0,
                )
                .map((r) => (
                  <div key={r.id} className="py-4">
                    <p className="mb-3">
                      {
                        data.purchases.find((p) => p.id === r.purchase_id)
                          ?.supplier
                      }{" "}
                      ·{" "}
                      {
                        data.purchases.find((p) => p.id === r.purchase_id)
                          ?.title
                      }{" "}
                      · Kredit: {formatMoney(r.available)}
                    </p>
                    <SupplierCreditActions
                      data={data}
                      credit={r}
                      admin={admin}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <WorkerAdvanceButton data={data} />
              </div>
              {reconciliation ? (
                <dl className="metric-grid my-5 grid grid-cols-2 gap-4 text-sm xl:grid-cols-4">
                  {reconciliation.summary.map((s) => (
                    <div key={s.label}>
                      <dt className="text-[var(--muted)]">{s.label}</dt>
                      <dd className="mt-1 font-semibold">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <h3 className="mb-2 font-semibold">Ümumi avanslar</h3>
              <div className="mb-6 divide-y divide-[var(--border)]">
                {(data.advances ?? [])
                  .filter(
                    (a) =>
                      !a.voided_at && (!f.worker || a.worker_id === f.worker),
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p>{a.worker}</p>
                        <p className="text-sm text-[var(--muted)]">
                          Verilib: {formatMoney(a.amount)} · Ümumi avans qalığı:{" "}
                          {formatMoney(a.remaining)}
                        </p>
                      </div>
                      {a.remaining > 0 && (
                        <AdvanceAllocationButton data={data} advance={a} />
                      )}
                    </div>
                  ))}
              </div>
              <div className="table-scroll">
                <table className="data-table w-full min-w-[850px] text-sm">
                  <thead>
                    <tr>
                      {[
                        "Usta / iş",
                        "Maya",
                        "Qazanılmış",
                        "Ödənilib",
                        "İşə bağlı avans",
                        "Qazanılmış qalıq",
                        "Qalan maya",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.work
                      .filter(
                        (w) =>
                          (!f.worker || w.worker_id === f.worker) &&
                          (!f.job || w.service_job_id === f.job),
                      )
                      .map((w) => {
                        const paid = moneySum([
                            w.applied_advance ?? 0,
                            ...data.ledger
                              .filter(
                                (t) =>
                                  t.work_item_id === w.id &&
                                  t.allocation_type === "WORKER_WORK_ITEM" &&
                                  !t.voided_at,
                              )
                              .map((t) => t.amount),
                          ]),
                          earned =
                            w.status === "DONE" && w.labor_cost_known
                              ? Number(w.labor_cost)
                              : 0;
                        return (
                          <tr key={w.id}>
                            <td>
                              <Link
                                href={`/kassa?view=settlement&settlementJob=${w.service_job_id}`}
                                className="text-[var(--accent)]"
                              >
                                {w.worker} · {w.title}
                                {w.compensation_mode === "PERCENTAGE"
                                  ? " · Faizli"
                                  : ""}
                              </Link>
                            </td>
                            <td>
                              {w.labor_cost_known
                                ? formatMoney(w.labor_cost)
                                : "Maya dəyəri daxil edilməyib"}
                            </td>
                            {[
                              earned,
                              paid,
                              Math.max(moneyDiff(paid, earned), 0),
                              Math.max(moneyDiff(earned, paid), 0),
                              moneyDiff(Number(w.labor_cost), paid),
                            ].map((n, i) => (
                              <td key={i}>{formatMoney(n)}</td>
                            ))}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}
      {listView ? (
        <section className="my-8">
          <h2 className="mb-3 text-lg font-semibold">Ümumi jurnal</h2>
          <div
            className="table-scroll"
            role="region"
            aria-label="Maliyyə jurnalı"
            tabIndex={0}
          >
            <table className="data-table w-full min-w-[1400px] text-sm">
              <thead>
                <tr>
                  {[
                    "Tarix / vaxt",
                    "Kanal / Hesab",
                    "İstiqamət",
                    "Təyinat",
                    "Tərəf",
                    "Avtomobil / İş №",
                    "Əlavə izah",
                    "Reference",
                    "Mədaxil",
                    "Məxaric",
                    "Daxil edən",
                    "Sənəd",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={t.voided_at ? "opacity-50" : ""}>
                    <td>
                      {formatDate(t.transaction_date)}
                      <br />
                      {new Date(t.occurred_at).toLocaleTimeString("az-AZ", {
                        timeZone: "Asia/Baku",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      {channelName(t.channel)}
                      <br />
                      {
                        data.accounts.find(
                          (a) => a.id === t.financial_account_id,
                        )?.name
                      }
                    </td>
                    <td>
                      {t.voided_at
                        ? "Ləğv edilib"
                        : t.direction === "IN"
                          ? "Mədaxil"
                          : "Məxaric"}
                    </td>
                    <td>{financialCategoryLabel(t, data.categories)}</td>
                    <td>{t.counterparty_name_snapshot || "-"}</td>
                    <td>
                      {data.jobs.find((j) => j.id === t.service_job_id)
                        ?.plate || "-"}
                      <br />
                      {data.jobs.find((j) => j.id === t.service_job_id)?.job_no}
                    </td>
                    <td className="max-w-64 break-words">{t.purpose}</td>
                    <td>{t.bank_reference || t.reference_number || "-"}</td>
                    <td>
                      {t.direction === "IN" ? formatMoney(t.amount) : "-"}
                    </td>
                    <td>
                      {t.direction === "OUT" ? formatMoney(t.amount) : "-"}
                    </td>
                    <td>{t.created_by_name || "-"}</td>
                    <td>
                      <ReportActions
                        report="finance"
                        query={`transaction=${t.id}`}
                      />
                      {admin && !t.voided_at ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-red-400">
                            Ləğv et
                          </summary>
                          <ActionForm
                            action={voidPaymentAction}
                            className="mt-2 grid gap-2"
                          >
                            <input type="hidden" name="id" value={t.id} />
                            <input
                              name="void_reason"
                              required
                              maxLength={250}
                              placeholder="Ləğv səbəbi"
                              className="field"
                            />
                            <SubmitButton variant="danger">
                              Ləğv et
                            </SubmitButton>
                          </ActionForm>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? (
            <p className="py-5 text-[var(--muted)]">Əməliyyat yoxdur.</p>
          ) : null}
        </section>
      ) : null}
      {admin && (view === "accounts" || view === "categories") ? (
        <FinancialSettings data={data} view={view} />
      ) : null}
    </>
  );
}
function FinancialSettings({
  data,
  view,
}: {
  data: FinanceData;
  view: "accounts" | "categories";
}) {
  return (
    <section className="mt-8 border-t border-[var(--border)] pt-5">
      <h2 className="mb-4 text-lg font-semibold">
        {view === "accounts" ? "Bank hesabları" : "Təyinatlar"}
      </h2>
      {view === "accounts" ? (
        <details open>
          <summary className="cursor-pointer">Bank hesabları</summary>
          {[null, ...data.accounts.filter((a) => !a.deleted_at)].map((a) => (
            <div
              key={a?.id || "new"}
              className="border-t border-[var(--border)] py-4"
            >
              <h3 className="font-semibold">
                {a
                  ? `${a.name} · ${formatMoney(ledgerBalance(data.ledger.filter((t) => t.financial_account_id === a.id)))}`
                  : "Yeni bank hesabı"}
              </h3>
              <ActionForm
                key={a?.id || "new"}
                action={saveFinancialMasterAction}
                className="my-4 grid gap-3 border-t border-[var(--border)] py-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                <input type="hidden" name="kind" value="account" />
                <input type="hidden" name="id" value={a?.id || ""} />
                {[
                  ["name", "Hesab adı"],
                  ["bank_name", "Bankın adı"],
                  ["iban", "IBAN / Hesab №"],
                  ["account_holder", "Hesab sahibi"],
                  ["tax_id", "VÖEN"],
                  ["swift", "SWIFT/BIC"],
                  ["notes", "Qeyd"],
                ].map(([name, label]) => (
                  <label key={name} className="text-sm">
                    {label}
                    <input
                      name={name}
                      defaultValue={
                        (a?.[name as keyof typeof a] as string) || ""
                      }
                      required={name === "name"}
                      maxLength={name === "notes" ? 250 : 120}
                      className="field mt-1"
                    />
                  </label>
                ))}
                <label className="text-sm">
                  Valyuta
                  <input value="AZN" readOnly className="field mt-1" />
                </label>
                <label className="text-sm">
                  Status
                  <select
                    name="active"
                    defaultValue={String(a?.active ?? true)}
                    className="field mt-1"
                  >
                    <option value="true">Aktiv</option>
                    <option value="false">Arxiv</option>
                  </select>
                </label>
                <SubmitButton>
                  {a ? "Hesabı yenilə" : "Bank hesabı yarat"}
                </SubmitButton>
              </ActionForm>
              {a ? (
                <MasterLifecycle
                  kind="account"
                  id={a.id}
                  name={a.name}
                  active={a.active}
                />
              ) : null}
            </div>
          ))}
        </details>
      ) : null}
      {view === "categories" ? (
        <details open className="mt-4">
          <summary className="cursor-pointer">Yeni təyinat</summary>
          <ActionForm
            action={saveFinancialMasterAction}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            <input type="hidden" name="kind" value="category" />
            <label>
              Ad
              <input
                name="name"
                required
                maxLength={120}
                className="field mt-1"
              />
            </label>
            <label>
              İstiqamət
              <select name="direction" className="field mt-1">
                <option value="IN">Mədaxil</option>
                <option value="OUT">Məxaric</option>
              </select>
            </label>
            <SubmitButton>Təyinat yarat</SubmitButton>
          </ActionForm>
          {(["IN", "OUT"] as const).map((direction) => (
            <section key={direction} className="mt-6">
              <h3 className="text-lg font-semibold">
                {direction === "IN"
                  ? "Mədaxil təyinatları"
                  : "Məxaric təyinatları"}
              </h3>
              {data.categories
                .filter((c) => !c.deleted_at && c.direction === direction)
                .map((c) => (
                  <div
                    key={c.id}
                    className="border-b border-[var(--border)] py-4"
                  >
                    {c.is_system ? (
                      <p>
                        {c.name}{" "}
                        <span className="text-xs text-[var(--muted)]">
                          Sistem təyinatı
                        </span>
                      </p>
                    ) : (
                      <>
                        <ActionForm
                          action={saveFinancialMasterAction}
                          className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <input type="hidden" name="kind" value="category" />
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="direction"
                            value={c.direction}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={String(c.active)}
                          />
                          <label className="text-sm">
                            Ad · {c.active ? "Aktiv" : "Arxiv"}
                            <input
                              name="name"
                              defaultValue={c.name}
                              required
                              maxLength={120}
                              className="field mt-1"
                            />
                          </label>
                          <SubmitButton>Yadda saxla</SubmitButton>
                        </ActionForm>
                        <MasterLifecycle
                          kind="category"
                          id={c.id}
                          name={c.name}
                          active={c.active}
                        />
                      </>
                    )}
                  </div>
                ))}
            </section>
          ))}
        </details>
      ) : null}
    </section>
  );
}
