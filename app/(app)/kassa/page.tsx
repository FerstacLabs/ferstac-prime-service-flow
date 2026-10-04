import { requireAccess } from "@/lib/supabase/auth";
import { getFinance } from "@/lib/supabase/finance";
import { FinancePage } from "@/components/finance-page";
import type { SearchParams } from "@/lib/filters";
import { ReconciliationHistory } from "@/components/reconciliation-history";
export const dynamic = "force-dynamic";
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireAccess(["ADMIN", "CASHIER"]);
  const params = await searchParams;
  return (
    <FinancePage
      data={await getFinance()}
      params={params}
      reconciliationHistory={
        params.view === "workers" ? (
          <ReconciliationHistory params={params} />
        ) : null
      }
      admin={profile.role === "ADMIN"}
    />
  );
}
