"use client";
import { Pencil } from "lucide-react";

export function WorkerEditButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        const editor = document.getElementById("worker-edit");
        if (editor instanceof HTMLDetailsElement) {
          editor.open = true;
          editor.scrollIntoView({ block: "start", behavior: "smooth" });
          editor
            .querySelector<HTMLInputElement>('input[name="first_name"]')
            ?.focus({ preventScroll: true });
        }
      }}
    >
      <Pencil size={16} />
      Redaktə et
    </button>
  );
}
