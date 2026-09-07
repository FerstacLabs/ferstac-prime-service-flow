"use client";

import { RotateCcw } from "lucide-react";
import { Panel } from "@/components/app-shell";
import { WorkshopLoader } from "@/components/workshop-loader";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <WorkshopLoader label="Məlumat yüklənmədi" />
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Sessiya və ya server bağlantısı hazır deyil. Bir az sonra yenidən yoxlayın.
          </p>
        </div>
        <button onClick={reset} className="btn btn-secondary w-fit">
          <RotateCcw size={16} />
          Yenilə
        </button>
      </div>
    </Panel>
  );
}
