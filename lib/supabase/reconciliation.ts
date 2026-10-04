import "server-only";
import { requireAccess } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  reconciliationReport,
  type ReconciliationDocument,
} from "@/lib/reconciliation";
import { databaseActionError } from "@/lib/action-errors";
import { z } from "zod";

export async function getReconciliation(id: string, seal = false) {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase, profile } = await requireAccess(["ADMIN", "CASHIER"]);
  const { data, error } = await supabase
    .from("reconciliation_documents")
    .select("*")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (error) throw new Error(databaseActionError(error));
  const document = data as ReconciliationDocument | null;
  if (document && !document.report_snapshot && seal) {
    const report = reconciliationReport(document);
    const { error: sealingError } = await createSupabaseAdminClient().rpc(
      "seal_reconciliation",
      {
        p_id: id,
        p_org: profile.organization_id,
        p_report: report,
      },
    );
    if (sealingError) throw new Error(databaseActionError(sealingError));
    return getReconciliation(id);
  }
  return document;
}
