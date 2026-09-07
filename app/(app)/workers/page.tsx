import Link from "next/link";
import { saveWorkerAction } from "@/app/actions/workers";
import { PageHeader, Panel } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { formatMoney } from "@/lib/format";
import { getJobs, getMasterData, getWorkItems, getWorkers, workerDisplayName, workTitle } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const [workers, workItems, jobs, master] = await Promise.all([getWorkers(), getWorkItems(), getJobs(), getMasterData()]);
  const month = new Date().getMonth();
  const year = new Date().getFullYear();

  return (
    <>
      <PageHeader title="İşçilər" eyebrow="Ustalar və məhsuldarlıq" actions={<ReportActions report="workers" />} />
      <Panel className="mb-5">
        <h2 className="mb-4 text-lg font-semibold">Yeni işçi</h2>
        <form action={saveWorkerAction} className="grid gap-3 md:grid-cols-4">
          <input name="first_name" required className="field" placeholder="Ad" />
          <input name="last_name" required className="field" placeholder="Soyad" />
          <input name="father_name" className="field" placeholder="Ata adı" />
          <input name="phone" className="field" placeholder="Telefon" />
          <select name="role_id" required className="field md:col-span-2"><option value="">İxtisas / rol</option>{master.workerRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
          <input name="hire_date" type="date" className="field" />
          <select name="active" className="field"><option value="true">Aktiv</option><option value="false">Deaktiv</option></select>
          <input name="notes" className="field md:col-span-3" placeholder="Qeyd" />
          <button className="rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-black">İşçini saxla</button>
        </form>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {workers.length === 0 ? <Panel>İşçi yoxdur.</Panel> : null}
        {workers.map((worker) => {
          const items = workItems.filter((item) => item.assigned_worker_id === worker.id);
          const active = items.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED");
          const completedThisMonth = items.filter((item) => item.status === "DONE" && item.completed_at && new Date(item.completed_at).getMonth() === month && new Date(item.completed_at).getFullYear() === year);
          const laborMonth = completedThisMonth.reduce((total, item) => total + item.labor_cost, 0);
          return (
            <Panel key={worker.id}>
              <div className="flex items-start justify-between gap-3">
                <div><Link href={`/workers/${worker.id}`} className="text-lg font-semibold hover:text-[var(--accent)]">{workerDisplayName(worker)}</Link><p className="mt-1 text-sm text-[var(--muted)]">{worker.worker_roles?.name}</p></div>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${worker.active ? "border-[rgba(69,201,121,.45)] text-[var(--success)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{worker.active ? "Aktiv" : "Deaktiv"}</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric label="Aktiv tapşırıq" value={String(active.length)} />
                <Metric label="Bu ay" value={String(completedThisMonth.length)} />
                <Metric label="Əmək dəyəri" value={formatMoney(laborMonth)} />
              </div>
              <div className="mt-4 space-y-2">
                {items.slice(0, 3).map((item) => {
                  const job = jobs.find((job) => job.id === item.service_job_id);
                  return <div key={item.id} className="rounded-lg bg-black/20 p-3 text-sm"><span className="font-mono">{job?.vehicles?.plate ?? "-"}</span> - {workTitle(item)}</div>;
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
