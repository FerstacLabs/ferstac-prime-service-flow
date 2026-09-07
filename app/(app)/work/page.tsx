import { PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { getVehicle, getWorkerName, getWorkName, serviceJobs, workCatalog, workers, workItems } from "@/lib/demo-data";
import { formatDate, formatMoney } from "@/lib/format";

export default function WorkPage() {
  const groups = [
    { title: "Gözləyir", statuses: ["TODO"] },
    { title: "İcra olunur", statuses: ["IN_PROGRESS"] },
    { title: "Tamamlandı", statuses: ["DONE"] }
  ] as const;

  return (
    <>
      <PageHeader title="Görüləcək işlər" eyebrow="Qlobal iş növbəsi" actions={<ReportActions report="work" />} />
      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <input className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" placeholder="Nömrə" />
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Usta</option>{workers.map((worker) => <option key={worker.id}>{worker.firstName} {worker.lastName}</option>)}</select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Kateqoriya</option>{Array.from(new Set(workCatalog.map((item) => item.category))).map((category) => <option key={category}>{category}</option>)}</select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Status</option></select>
        <input type="date" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-lg font-semibold">{group.title}</h2>
            <div className="space-y-3">
              {workItems.filter((item) => group.statuses.includes(item.status as never)).map((item) => {
                const job = serviceJobs.find((job) => job.id === item.serviceJobId)!;
                const vehicle = getVehicle(job);
                return (
                  <Panel key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xl font-bold">{vehicle.plate}</div>
                        <p className="text-sm text-[var(--muted)]">{vehicle.make} {vehicle.model}</p>
                      </div>
                      <StatusBadge>{statusLabels[item.status]}</StatusBadge>
                    </div>
                    <h3 className="mt-4 font-semibold">{getWorkName(item)}</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[var(--muted)]">Usta</span><div>{getWorkerName(item.assignedWorkerId)}</div></div>
                      <div><span className="text-[var(--muted)]">Əmək</span><div>{formatMoney(item.laborCost)}</div></div>
                      <div><span className="text-[var(--muted)]">Plan</span><div>{formatDate(item.plannedAt)}</div></div>
                      <div><span className="text-[var(--muted)]">Status</span><div>{statusLabels[item.status]}</div></div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
