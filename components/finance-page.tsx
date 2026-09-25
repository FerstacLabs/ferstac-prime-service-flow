import Link from "next/link";
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
    view = typeof params.view === "string" ? params.view : "cash";
  if (view === "cash") f.channel = "CASH";
  if (view === "bank") f.channel = "BANK";
  const rows = filterLedger(data, f),
    cash = movementTotals(rows.filter((t) => t.channel === "CASH")),
    bank = movementTotals(rows.filter((t) => t.channel === "BANK")),
    total = movementTotals(rows),
    selected = data.jobs.find((j) => j.id === f.job),
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
        defaultValue={f[name as keyof typeof f]}
        className="field mt-1"
      >
        <option value="">Hamısı</option>
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
        actions={<ReportActions report="finance" query={query} />}
      />
      <nav
        aria-label="Maliyyə bölmələri"
        className="mb-5 flex flex-wrap gap-4 border-b border-[var(--border)] pb-3"
      >
        {[
          ["cash", "Nağd Kassa"],
          ["bank", "Bank / Hesab"],
          ["journal", "Ümumi jurnal"],
          ["workers", "İşçilərlə hesablaşma"],
        ].map(([key, title]) => (
          <Link
            key={key}
            href={`/kassa?view=${key}`}
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
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Cari vəsait</h2>
        <MoneyGrid
          items={[
            [
              "Nağd qalıq",
              ledgerBalance(data.ledger.filter((t) => t.channel === "CASH")),
            ],
            ...data.accounts.map(
              (a) =>
                [
                  a.name + (a.active ? "" : " (arxiv)"),
                  ledgerBalance(
                    data.ledger.filter((t) => t.financial_account_id === a.id),
                  ),
                ] as [string, number],
            ),
            ["Ümumi vəsait", ledgerBalance(data.ledger)],
          ]}
        />
      </section>
      <div className="mb-6 flex flex-wrap gap-3">
        <NewMovement
          data={data}
          direction="IN"
          channel={view === "bank" ? "BANK" : "CASH"}
          account={f.account}
        />
        <NewMovement
          data={data}
          direction="OUT"
          channel={view === "bank" ? "BANK" : "CASH"}
          account={f.account}
        />
        <TransferForm accounts={data.accounts} />
        {admin ? (
          <NewMovement
            data={data}
            direction="IN"
            channel={view === "bank" ? "BANK" : "CASH"}
            account={f.account}
            opening
          />
        ) : null}
      </div>
      <form className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="view" value={view} />
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
        {view === "journal"
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
        {select("category", "Kateqoriya", data.categories)}
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
              data.work
                .filter((w) => w.worker_id)
                .map((w) => [
                  w.worker_id!,
                  { id: w.worker_id!, name: w.worker },
                ]),
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
          <input name="party" defaultValue={f.party} className="field mt-1" />
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Tətbiq et</button>
          <Link className="btn btn-secondary" href={`/kassa?view=${view}`}>
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
      {view === "cash" || view === "bank" ? (
        <section className="my-6">
          <h2 className="text-lg font-semibold">
            {start === end
              ? `Gündəlik qalıq · ${start}`
              : `Dövr qalığı · ${start} / ${end}`}
          </h2>
          <ReportActions
            report="finance"
            query={new URLSearchParams({
              channel: f.channel,
              account: f.account,
              from: start,
              to: end,
            }).toString()}
          />
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
              ["Məlum maya", vehicleSettlement(data, selected.id).totalCost],
              ["Qalan öhdəlik", vehicleSettlement(data, selected.id).remaining],
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
                  data={data}
                  direction="IN"
                  channel={view === "bank" ? "BANK" : "CASH"}
                  job={selected}
                />
              ) : null}
              <SettlementDialog data={data} job={selected} />
            </div>
          )}
        </section>
      ) : (
        <section className="my-6">
          <h2 className="mb-3 text-lg font-semibold">Avtomobil balansları</h2>
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
                        href={`/kassa?view=${view}&job=${j.id}`}
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
      {view === "workers" ? (
        <section className="my-6">
          <h2 className="mb-3 text-lg font-semibold">İşçilərlə hesablaşma</h2>
          <div className="table-scroll">
            <table className="data-table w-full min-w-[850px] text-sm">
              <thead>
                <tr>
                  {[
                    "Usta / iş",
                    "Maya",
                    "Qazanılmış",
                    "Ödənilib",
                    "Avans",
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
                    const paid = moneySum(
                        data.ledger
                          .filter(
                            (t) =>
                              t.work_item_id === w.id &&
                              t.allocation_type === "WORKER_WORK_ITEM" &&
                              !t.voided_at,
                          )
                          .map((t) => t.amount),
                      ),
                      earned =
                        w.status === "DONE" && w.labor_cost_known
                          ? Number(w.labor_cost)
                          : 0;
                    return (
                      <tr key={w.id}>
                        <td>
                          <Link
                            href={`/kassa?view=workers&job=${w.service_job_id}`}
                            className="text-[var(--accent)]"
                          >
                            {w.worker} · {w.title}
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
        </section>
      ) : null}
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
                  "Kateqoriya",
                  "Tərəf",
                  "Avtomobil / İş №",
                  "Təyinat",
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
                      data.accounts.find((a) => a.id === t.financial_account_id)
                        ?.name
                    }
                  </td>
                  <td>
                    {t.voided_at
                      ? "Ləğv edilib"
                      : t.direction === "IN"
                        ? "Mədaxil"
                        : "Məxaric"}
                  </td>
                  <td>
                    {t.transfer_id
                      ? "Daxili köçürmə"
                      : t.allocation_type.startsWith("OPENING_")
                        ? "Başlanğıc qalıq"
                        : data.categories.find((c) => c.id === t.category_id)
                            ?.name || t.allocation_type}
                  </td>
                  <td>{t.counterparty_name_snapshot || "-"}</td>
                  <td>
                    {data.jobs.find((j) => j.id === t.service_job_id)?.plate ||
                      "-"}
                    <br />
                    {data.jobs.find((j) => j.id === t.service_job_id)?.job_no}
                  </td>
                  <td className="max-w-64 break-words">{t.purpose}</td>
                  <td>{t.bank_reference || t.reference_number || "-"}</td>
                  <td>{t.direction === "IN" ? formatMoney(t.amount) : "-"}</td>
                  <td>{t.direction === "OUT" ? formatMoney(t.amount) : "-"}</td>
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
                          <SubmitButton variant="danger">Ləğv et</SubmitButton>
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
      {admin ? <FinancialSettings data={data} /> : null}
    </>
  );
}
function FinancialSettings({ data }: { data: FinanceData }) {
  return (
    <section className="mt-8 border-t border-[var(--border)] pt-5">
      <h2 className="mb-4 text-lg font-semibold">Maliyyə parametrləri</h2>
      <details>
        <summary className="cursor-pointer">Bank hesabları</summary>
        {[null, ...data.accounts].map((a) => (
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
                  defaultValue={(a?.[name as keyof typeof a] as string) || ""}
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
        ))}
      </details>
      <details className="mt-4">
        <summary className="cursor-pointer">Yeni kateqoriya</summary>
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
          <SubmitButton>Kateqoriya yarat</SubmitButton>
        </ActionForm>
      </details>
    </section>
  );
}
