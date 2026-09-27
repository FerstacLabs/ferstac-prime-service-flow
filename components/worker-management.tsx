import { saveWorkerAction } from "@/app/actions/workers";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { MasterLifecycle } from "@/components/master-lifecycle";
import {
  getMasterData,
  workerDisplayName,
  type DbWorker,
} from "@/lib/supabase/queries";

export async function WorkerManagement({ worker }: { worker: DbWorker }) {
  if (worker.deleted_at)
    return (
      <p className="my-4 text-sm text-[var(--muted)]">
        Silinmiş işçi · Tarixçə saxlanılıb
      </p>
    );
  const { workerRoles } = await getMasterData();
  return (
    <section className="my-5 border-y border-[var(--border)] py-4">
      <details>
        <summary className="cursor-pointer font-semibold">Redaktə et</summary>
        <ActionForm
          action={saveWorkerAction}
          className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <input type="hidden" name="id" value={worker.id} />
          <input type="hidden" name="active" value={String(worker.active)} />
          {(
            [
              ["first_name", "Ad"],
              ["last_name", "Soyad"],
              ["father_name", "Ata adı"],
              ["phone", "Telefon"],
              ["hire_date", "İşə başlama"],
              ["notes", "Qeyd"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                name={key}
                type={key === "hire_date" ? "date" : "text"}
                defaultValue={worker[key] || ""}
                required={key === "first_name" || key === "last_name"}
                maxLength={key === "notes" ? 250 : 120}
                className="field mt-1"
              />
            </label>
          ))}
          <label className="text-sm">
            İxtisas / rol
            <select
              name="role_id"
              defaultValue={worker.role_id}
              required
              className="field mt-1"
            >
              {workerRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>Yadda saxla</SubmitButton>
        </ActionForm>
      </details>
      <MasterLifecycle
        id={worker.id}
        name={workerDisplayName(worker)}
        kind="worker"
        active={worker.active}
      />
    </section>
  );
}
