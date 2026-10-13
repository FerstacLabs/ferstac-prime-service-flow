import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAccess } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signedPdfLimit, validateSignedPdf } from "@/lib/reconciliation";
import {
  actionFailure,
  databaseActionError,
  visibleActionError,
} from "@/lib/action-errors";

const bucket = "prime-reconciliations";
const failure = (error: string, status: number) =>
  NextResponse.json({ error }, { status });
async function authorized(id: string) {
  const access = await getCurrentAccess();
  if (!access) return { response: failure("Giriş tələb olunur.", 401) };
  const p = access.profile;
  if (
    !p.is_active ||
    !p.session_valid ||
    p.must_change_password ||
    !["ADMIN", "CASHIER"].includes(p.role)
  )
    return { response: failure("Giriş icazəsi yoxdur.", 403) };
  if (!z.uuid().safeParse(id).success)
    return { response: failure("Sənəd tapılmadı.", 404) };
  const { data: document, error } = await access.supabase
    .from("reconciliation_documents")
    .select("id,status,outdated,signed_file_path,document_number")
    .eq("id", id)
    .eq("organization_id", p.organization_id)
    .maybeSingle();
  if (error) return { response: failure(actionFailure, 500) };
  if (!document) return { response: failure("Sənəd tapılmadı.", 404) };
  return { access, document };
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin)
    return failure("Giriş icazəsi yoxdur.", 403);
  const id = (await params).id;
  const result = await authorized(id);
  if (result.response) return result.response;
  const { access, document } = result;
  if (document.status !== "DRAFT" || document.outdated)
    return failure("Yeni hesablaşma versiyası yaradın.", 409);
  if (Number(request.headers.get("content-length")) > signedPdfLimit)
    return failure("PDF ölçüsü 10 MB-dan çox olmamalıdır.", 413);
  const reader = request.body?.getReader();
  if (!reader) return failure("PDF sənədini seçin.", 400);
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > signedPdfLimit) {
        await reader.cancel();
        return failure("PDF ölçüsü 10 MB-dan çox olmamalıdır.", 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    validateSignedPdf(bytes, request.headers.get("content-type") ?? "");
    const path = `${access.profile.organization_id}/reconciliations/${id}/${randomUUID()}.pdf`;
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError)
      throw new Error("İmzalı PDF yüklənmədi. Yenidən cəhd edin.");
    const { error } = await admin.rpc("attach_reconciliation_file", {
      p_id: id,
      p_org: access.profile.organization_id,
      p_actor: access.user.id,
      p_path: path,
      p_hash: createHash("sha256").update(bytes).digest("hex"),
      p_size: bytes.length,
    });
    if (error) {
      // This newly generated, unreferenced path is safe to clean up if confirmation won the race.
      await admin.storage.from(bucket).remove([path]);
      throw new Error(databaseActionError(error));
    }
    revalidatePath(`/kassa/reconciliations/${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(
      error instanceof Error
        ? visibleActionError(error.message)
        : actionFailure,
      400,
    );
  }
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await authorized((await params).id);
  if (result.response) return result.response;
  if (!result.document.signed_file_path)
    return failure("İmzalı sənəd tapılmadı.", 404);
  const { data, error } = await result.access.supabase.storage
    .from(bucket)
    .download(result.document.signed_file_path);
  if (error || !data) return failure("İmzalı sənəd açıla bilmədi.", 404);
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="PRIME_${result.document.document_number}_signed.pdf"`,
    },
  });
}
