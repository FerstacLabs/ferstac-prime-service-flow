"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { DecimalInput } from "@/components/decimal-input";
import { decimalMinor, parseLocalizedDecimal } from "@/lib/decimal";
import { saveWorkerCompensationPolicyAction } from "@/app/actions/workers";

export function WorkerPercentagePolicy({
  workerId,
  eligible = false,
  percentage = "60",
}: {
  workerId: string;
  eligible?: boolean;
  percentage?: string;
}) {
  const [value, setValue] = useState(percentage);
  let service = "-";
  try {
    const minor = 10000n - decimalMinor(parseLocalizedDecimal(value));
    service = `${minor / 100n},${String(minor % 100n).padStart(2, "0")}`;
  } catch {}
  return (
    <ActionForm
      action={saveWorkerCompensationPolicyAction}
      className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="worker_id" value={workerId} />
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="eligible" defaultChecked={eligible} />
        Faizlə işləyə bilər
      </label>
      <label className="text-sm">
        Usta payı (%)
        <DecimalInput
          name="worker_percentage"
          min="0.01"
          max="99.99"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="field mt-1"
        />
      </label>
      <p className="self-center text-sm">Servis payı: {service}%</p>
      <SubmitButton pendingText="Saxlanır...">
        Faiz qaydasını saxla
      </SubmitButton>
    </ActionForm>
  );
}
