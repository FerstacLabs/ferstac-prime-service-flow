"use client";
import { useState } from "react";
import { SearchSelect } from "@/components/search-select";

export function WorkAssignmentFields({
  workers,
  workerId,
  percentage,
}: {
  workers: Array<{ id: string; name: string; percentage_eligible?: boolean }>;
  workerId: string;
  percentage: boolean;
}) {
  const [selected, setSelected] = useState(workerId);
  const [checked, setChecked] = useState(percentage);
  const eligible = workers.find((w) => w.id === selected)?.percentage_eligible;
  return (
    <>
      <SearchSelect
        name="assigned_worker_id"
        label="Usta"
        options={workers}
        value={selected}
        onChange={(id) => {
          setSelected(id);
          if (!workers.find((w) => w.id === id)?.percentage_eligible)
            setChecked(false);
        }}
      />
      <input type="hidden" name="percentage_mode_present" value="true" />
      {(eligible || checked) && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="percentage"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Faizlə hesablanır
        </label>
      )}
    </>
  );
}
