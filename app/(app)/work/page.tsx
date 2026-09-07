import { updateWorkItemAction } from "@/app/actions/workers";
import { PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { getJobs, getMasterData, getWorkItems, getWorkers, workerDisplayName, workTitle } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const [workItems, workers, jobs, master] = await Promise.all([getWorkItems(), getWorkers(), getJobs(), getMasterData()]);
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
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Usta</option>{workers.map((worker) => <option key={worker.id}>{workerDisplayName(worker)}</option>)}</select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Kateqoriya</option>{Array.from(new Set(master.workCatalog.map((item) => item.category))).map((category) => <option key={category}>{category}</option>)}</select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Status</option></select>
        <input type="date" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-lg font-semibold">{group.title}</h2>
            <div className="space-y-3">
              {workItems.filter((item) => group.statuses.includes(item.status as never)).map((item) => {
                const job = jobs.find((job) => job.id === item.service_job_id);
                const vehicle = job?.vehicles;
                return (
                  <Panel key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-mono text-xl font-bold">{vehicle?.plate ?? "-"}</div><p className="text-sm text-[var(--muted)]">{vehicle?.make} {vehicle?.model}</p></div>
                      <StatusBadge>{statusLabels[item.status]}</StatusBadge>
                    </div>
                    <h3 className="mt-4 font-semibold">{workTitle(item)}</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[var(--muted)]">Usta</span><div>{workerDisplayName(item.workers)}</div></div>
                      <div><span className="text-[var(--muted)]">Əmək</span><div>{formatMoney(item.labor_cost)}</div></div>
                      <div><span className="text-[var(--muted)]">Plan</span><div>{formatDate(item.planned_at)}</div></div>
                      <div><span className="text-[var(--muted)]">Status</span><div>{statusLabels[item.status]}</div></div>
                    </div>
                    <form action={updateWorkItemAction} className="mt-4 grid gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <select name="assigned_worker_id" defaultValue={item.assigned_worker_id ?? ""} className="field"><option value="">Usta seçilməyib</option>{workers.filter((worker) => worker.active).map((worker) => <option key={worker.id} value={worker.id}>{workerDisplayName(worker)}</option>)}</select>
                      <select name="status" defaultValue={item.status} className="field"><option value="TODO">Gözləyir</option><option value="IN_PROGRESS">İcra olunur</option><option value="DONE">Tamamlandı</option><option value="CANCELLED">Ləğv edildi</option></select>
                      <input name="labor_cost" type="number" min="0" step="0.01" defaultValue={item.labor_cost} className="field" placeholder="Usta iş ödənişi / əmək xərci" />
                      <input name="notes" defaultValue={item.notes ?? ""} className="field" placeholder="Qeyd" />
                      <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Yenilə</button>
                    </form>
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
