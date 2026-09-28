export const actionFailure =
  "Əməliyyat alınmadı. Məlumatları yoxlayıb yenidən cəhd edin.";
export const duplicatePartFailure =
  "Bu detal bu servis kartında artıq mövcuddur. Mövcud detalın alış/maya məlumatını yeniləyin və ya başqa detal seçin.";

// Returned business messages may be displayed; framework/database diagnostics may not.
export function visibleActionError(message: unknown): string {
  if (
    typeof message !== "string" ||
    message.length > 500 ||
    !/[əƏıİşŞçÇğĞöÖüÜ]/.test(message) ||
    /react|digest|stack|constraint|postgres|supabase|sqlstate|NEXT_|https?:|[0-9a-f]{8}-[0-9a-f]{4}-|\bat\s+\S+\s*\(/i.test(
      message,
    )
  )
    return actionFailure;
  return message;
}

export function databaseActionError(error: {
  code?: string;
  message?: string;
}) {
  if (error.code === "23505")
    return "Bu məlumat artıq mövcuddur. Başqa ad seçin.";
  if (error.code === "23503")
    return "Əlaqəli qeyd istifadə olunur və ya artıq mövcud deyil.";
  if (error.code === "42501")
    return "Bu əməliyyata icazə yoxdur və ya qeyd artıq aktiv deyil.";
  return error.code === "P0001"
    ? visibleActionError(error.message)
    : actionFailure;
}
