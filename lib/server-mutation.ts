import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { actionFailure, visibleActionError } from "@/lib/action-errors";

export async function serverMutation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) {
      return {
        error:
          "Daxil edilən məlumatları yoxlayın. Məcburi sahələr, tarix və məbləğ düzgün olmalıdır.",
      };
    }
    return {
      error:
        error instanceof Error
          ? visibleActionError(error.message)
          : actionFailure,
    };
  }
}
