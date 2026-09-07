import { PageHeader, Panel } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { getVehicle, getWorkName, serviceJobs, workers, workItems } from "@/lib/demo-data";
import { formatMoney } from "@/lib/format";

export default function WorkersPage() {
  return (
    <>
      <PageHeader title="İşçilər" eyebrow="Ustalar və məhsuldarlıq" actions={<ReportActions report="workers" />} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {workers.map((worker) => {
          const items = workItems.filter((item) => item.assignedWorkerId === worker.id);
          const active = items.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED");
          const done = items.filter((item) => item.status === "DONE");
          const laborMonth = done.reduce((total, item) => total + item.laborCost, 0);
          return (
            <Panel key={worker.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{worker.firstName} {worker.lastName}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{worker.role}</p>
                </div>
                <span className="rounded-full border border-[rgba(69,201,121,.45)] px-2.5 py-1 text-xs text-[var(--success)]">Aktiv</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric label="Aktiv tapşırıq" value={String(active.length)} />
                <Metric label="Bu ay" value={String(done.length)} />
                <Metric label="Əmək dəyəri" value={formatMoney(laborMonth)} />
              </div>
              <div className="mt-4 space-y-2">
                {items.slice(0, 3).map((item) => {
                  const job = serviceJobs.find((job) => job.id === item.serviceJobId)!;
                  return <div key={item.id} className="rounded-lg bg-black/20 p-3 text-sm"><span className="font-mono">{getVehicle(job).plate}</span> - {getWorkName(item)}</div>;
                })}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
