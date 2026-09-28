"use client";
import { useState } from "react";
import {
  FinanceDialog,
  FinanceActionForm,
  PaymentSource,
  MovementDetails,
} from "@/components/finance-forms";
import { SearchSelect } from "@/components/search-select";
import { DecimalInput } from "@/components/decimal-input";
import { SubmitButton } from "@/components/submit-button";
import {
  recordWorkerAdvanceAction,
  allocateWorkerAdvanceAction,
} from "@/app/actions/ledger";
import { moneySum, moneyDiff, type FinanceData } from "@/lib/finance";
import { formatMoney } from "@/lib/format";

export function WorkerAdvanceButton({ data }: { data: FinanceData }) {
  const [worker, setWorker] = useState("");
  const [job, setJob] = useState("");
  const [work, setWork] = useState("");
  return (
    <FinanceDialog label="Avans ver" icon="out">
      <FinanceActionForm
        action={recordWorkerAdvanceAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <SearchSelect
          name="worker_id"
          label="Usta"
          required
          options={(data.workers ?? []).filter((w) => w.active)}
          value={worker}
          onChange={(id) => {
            setWorker(id);
            setWork("");
          }}
        />
        <label className="text-sm">
          Məbləğ (AZN)
          <DecimalInput
            name="amount"
            required
            min="0.01"
            className="field mt-1"
          />
        </label>
        <SearchSelect
          name="service_job_id"
          label="Avtomobil"
          options={data.jobs
            .filter((j) => !j.closed_at && !j.inactive)
            .map((j) => ({ id: j.id, name: `${j.plate} · ${j.job_no}` }))}
          value={job}
          onChange={(id) => {
            setJob(id);
            setWork("");
          }}
        />
        <SearchSelect
          name="target_id"
          label="İş"
          options={data.work
            .filter(
              (w) =>
                w.worker_id === worker &&
                (!job || w.service_job_id === job) &&
                w.status !== "CANCELLED" &&
                w.labor_cost_known &&
                data.jobs.some(
                  (j) =>
                    j.id === w.service_job_id && !j.closed_at && !j.inactive,
                ),
            )
            .map((w) => ({
              id: w.id,
              name: `${data.jobs.find((j) => j.id === w.service_job_id)?.plate} · ${w.title}`,
            }))}
          value={work}
          onChange={setWork}
        />
        <p className="sm:col-span-2 text-sm font-medium">
          {work ? "İşə bağlı avans" : "Ümumi avans"}
        </p>
        <PaymentSource accounts={data.accounts} />
        <MovementDetails direction="OUT" purpose="Usta avansı" hideParty />
        <SubmitButton pendingText="Qeydə alınır...">
          Avansı qeydə al
        </SubmitButton>
      </FinanceActionForm>
    </FinanceDialog>
  );
}

export function AdvanceAllocationButton({
  data,
  advance,
}: {
  data: FinanceData;
  advance: NonNullable<FinanceData["advances"]>[number];
}) {
  const jobs = data.jobs.filter((j) => !j.closed_at && !j.inactive);
  const options = data.work
    .filter(
      (w) =>
        w.worker_id === advance.worker_id &&
        w.status === "DONE" &&
        w.labor_cost_known &&
        jobs.some((j) => j.id === w.service_job_id),
    )
    .flatMap((w) => {
      const paid = moneySum([
        w.applied_advance ?? 0,
        ...data.ledger
          .filter(
            (t) =>
              t.work_item_id === w.id &&
              t.allocation_type === "WORKER_WORK_ITEM" &&
              !t.voided_at,
          )
          .map((t) => t.amount),
      ]);
      const remaining = moneyDiff(Number(w.labor_cost), paid);
      return remaining > 0
        ? [
            {
              id: w.id,
              name: `${jobs.find((j) => j.id === w.service_job_id)?.plate} · ${w.title} · ${formatMoney(remaining)}`,
            },
          ]
        : [];
    });
  return (
    <FinanceDialog label="İşə tətbiq et" icon="settle">
      <FinanceActionForm
        action={allocateWorkerAdvanceAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="advance_id" value={advance.id} />
        <p className="sm:col-span-2">
          {advance.worker} · Ümumi avans: {formatMoney(advance.remaining)}
        </p>
        <SearchSelect
          name="work_item_id"
          label="Qazanılmış usta borcu"
          options={options}
          required
        />
        <label className="text-sm">
          Tətbiq edilən məbləğ
          <DecimalInput
            name="amount"
            required
            min="0.01"
            max={advance.remaining}
            className="field mt-1"
          />
        </label>
        <SubmitButton pendingText="Tətbiq edilir...">
          Avansı tətbiq et
        </SubmitButton>
      </FinanceActionForm>
    </FinanceDialog>
  );
}
