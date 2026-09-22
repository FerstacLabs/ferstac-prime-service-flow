import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/supabase/auth";
import { roleHome } from "@/lib/security";

export default async function Home() {
  redirect(roleHome((await requireAccess()).profile.role));
}
