import { notFound } from "next/navigation";
import { PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { getJobs, getWorkItems, getWorkers, workerDisplayName, workTitle } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function WorkerDetailPage({ params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  const [workers, workItems, jobs] = await Promise.all([getWorkers(), getWorkItems(), getJobs()]);
  const worker = workers.find((item) => item.id === workerId);
  if (!worker) notFound();
  const items = workItems.filter((item) => item.assigned_worker_id === worker.id);
  return (
    <>
      <PageHeader title={workerDisplayName(worker)} eyebrow={worker.worker_roles?.name ?? "İşçi"} actions={<ReportActions report="workers" />} />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Avtomobil</th><th>İş</th><th>Status</th><th>Əmək xərci</th><th>Plan</th></tr></thead>
            <tbody>{items.map((item) => { const job = jobs.find((job) => job.id === item.service_job_id); return <tr key={item.id} className="border-t border-[var(--border)]"><td className="py-3 font-mono">{job?.vehicles?.plate ?? "-"}</td><td>{workTitle(item)}</td><td><StatusBadge>{statusLabels[item.status]}</StatusBadge></td><td>{formatMoney(item.labor_cost)}</td><td>{formatDate(item.planned_at)}</td></tr>; })}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
