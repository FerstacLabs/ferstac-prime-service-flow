import Link from "next/link";
import { PageHeader, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { MoneyGrid } from "@/components/job-finance";
import { getWorkshop, selectJobs } from "@/lib/supabase/workshop";
import { jobFinance, sumMoney } from "@/lib/workshop";
import { formatMoney } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function OverviewPage() {
  const data = await getWorkshop(),
    jobs = selectJobs(data).filter((j) => j.status !== "DELIVERED"),
    totals = jobs.map((j) =>
      jobFinance(j, data.work, data.parts, data.purchases, data.cash),
    );
  const missing = totals.filter((n) => n.grossProfit == null).length;
  return (
    <>
      <PageHeader
        title="İcmal"
        eyebrow="İdarəetmə"
        actions={<ReportActions report="overview" />}
      />
      <p className="text-[var(--muted)]">
        Aktiv avtomobillər: {jobs.length} · Tamamlanmış işlər:{" "}
        {
          data.work.filter(
            (w) =>
              w.status === "DONE" &&
              jobs.some((j) => j.id === w.service_job_id),
          ).length
        }
      </p>
      <MoneyGrid
        items={[
          [
            "Müştəri təklifləri / əvvəlki büdcələr",
            sumMoney(totals.map((n) => n.quotedTotal)),
          ],
          ["Məlum faktiki maya", sumMoney(totals.map((n) => n.totalCost))],
          ["Müştəridən alınıb", sumMoney(totals.map((n) => n.customerPaid))],
          ["Müştəri borcu", sumMoney(totals.map((n) => n.customerReceivable))],
          ["Təchizatçı borcu", sumMoney(totals.map((n) => n.supplierPayable))],
          ["Usta borcu", sumMoney(totals.map((n) => n.workerPayable))],
          ["Usta avansı", sumMoney(totals.map((n) => n.workerAdvance))],
          [
            "Ümumi brüt mənfəət",
            missing ? null : sumMoney(totals.map((n) => n.grossProfit)),
          ],
        ]}
      />
      {missing ? (
        <p className="mb-5 text-sm text-[var(--warning)]">
          {missing} servis kartında mənfəət tam hesablanmayıb.
        </p>
      ) : null}
      <div className="divide-y divide-[var(--border)]">
        {jobs.map((j, i) => {
          const n = totals[i];
          return (
            <article key={j.id} className="py-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <Link
                    href={`/vehicles/${j.id}`}
                    className="font-mono text-xl font-bold"
                  >
                    {j.vehicles?.plate}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {j.vehicles?.make} {j.vehicles?.model} ·{" "}
                    {statusLabels[j.status]}
                  </p>
                </div>
                <Link className="btn btn-secondary" href={`/vehicles/${j.id}`}>
                  Aç
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                {[
                  ["Təklif", formatMoney(n.quotedTotal)],
                  ["Məlum maya", formatMoney(n.totalCost)],
                  ["Müştəri borcu", formatMoney(n.customerReceivable)],
                  [
                    "Brüt mənfəət",
                    n.grossProfit == null
                      ? "Mənfəət tam hesablanmayıb"
                      : formatMoney(n.grossProfit),
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-[var(--muted)]">{k}</span>
                    <p>{v}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
