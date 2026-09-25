import { requireAccess } from "@/lib/supabase/auth";
import { getFinance } from "@/lib/supabase/finance";
import { FinancePage } from "@/components/finance-page";
import type { SearchParams } from "@/lib/filters";
export const dynamic = "force-dynamic";
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireAccess(["ADMIN", "CASHIER"]);
  return (
    <FinancePage
      data={await getFinance()}
      params={await searchParams}
      admin={profile.role === "ADMIN"}
    />
  );
}
