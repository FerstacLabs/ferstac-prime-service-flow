import { manageMasterAction } from "@/app/actions/ledger";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { DeleteMasterDialog } from "@/components/finance-forms";

export function MasterLifecycle({
  id,
  name,
  kind,
  active,
}: {
  id: string;
  name: string;
  kind: "worker" | "account" | "category";
  active: boolean;
}) {
  return (
    <div className="my-3 flex flex-wrap items-start gap-3">
      <ActionForm action={manageMasterAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="kind" value={kind} />
        <input
          type="hidden"
          name="lifecycle_action"
          value={active ? "archive" : "restore"}
        />
        <SubmitButton variant="secondary">
          {active ? "Arxivlə" : "Bərpa et"}
        </SubmitButton>
      </ActionForm>
      <DeleteMasterDialog id={id} name={name} kind={kind} />
    </div>
  );
}
