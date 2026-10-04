"use client";
import { useState } from "react";
import Link from "next/link";
import type { FinanceData, JournalFilters } from "@/lib/finance";

export function ReconciliationFilters({
  data,
  filters: f,
}: {
  data: FinanceData;
  filters: JournalFilters;
}) {
  const [kind, setKind] = useState(
    f.reportType === "supplier" ? "supplier" : "worker",
  );
  const parties =
    kind === "worker"
      ? (data.workers ?? [])
      : Array.from(
          new Map(
            data.purchases
              .filter((p) => p.supplier_id)
              .map((p) => [
                p.supplier_id!,
                { id: p.supplier_id!, name: p.supplier },
              ]),
          ).values(),
        );
  return (
    <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="view" value="workers" />
      <label className="text-sm">
        Hesablaşma növü
        <select
          className="field mt-1"
          name="reportType"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="worker">İşçi / Usta</option>
          <option value="supplier">Təchizatçı</option>
        </select>
      </label>
      <label className="text-sm">
        {kind === "worker" ? "İşçi" : "Təchizatçı"}
        <select
          key={kind}
          className="field mt-1"
          name={kind}
          defaultValue={kind === "worker" ? f.worker : f.supplier}
        >
          <option value="">Hamısı</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Avtomobil
        <select className="field mt-1" name="job" defaultValue={f.job}>
          <option value="">Hamısı</option>
          {data.jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.plate}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Başlanğıc tarix
        <input
          className="field mt-1"
          type="date"
          name="from"
          defaultValue={f.from}
        />
      </label>
      <label className="text-sm">
        Son tarix
        <input
          className="field mt-1"
          type="date"
          name="to"
          defaultValue={f.to}
          min={f.from || undefined}
        />
      </label>
      <div className="flex items-end gap-2">
        <button className="btn btn-primary">Tətbiq et</button>
        <Link className="btn btn-secondary" href="/kassa?view=workers">
          Sıfırla
        </Link>
      </div>
    </form>
  );
}
