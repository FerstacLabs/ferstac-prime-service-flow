"use client";
import { useState } from "react";
import { DecimalInput } from "@/components/decimal-input";
export function FundingFields({
  job,
}: {
  job?: {
    funding_source: string;
    insurance_company: string | null;
    insurance_claim_no: string | null;
    insurance_approved_amount: number | null;
  };
}) {
  const [source, setSource] = useState(
    job?.funding_source ?? "CUSTOMER_FUNDED",
  );
  return (
    <>
      <label className="text-sm text-[var(--muted)]">
        Mənbə
        <select
          name="funding_source"
          className="field mt-1"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="CUSTOMER_FUNDED">Müştəri hesabına</option>
          <option value="INSURANCE_CLAIM">Sığorta hadisəsi üzrə</option>
        </select>
      </label>
      {source === "INSURANCE_CLAIM" ? (
        <>
          <label className="text-sm text-[var(--muted)]">
            Sığorta şirkəti
            <input
              name="insurance_company"
              className="field mt-1"
              defaultValue={job?.insurance_company ?? ""}
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Sığorta işi / claim nömrəsi
            <input
              name="insurance_claim_no"
              className="field mt-1"
              defaultValue={job?.insurance_claim_no ?? ""}
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Sığorta tərəfindən təsdiqlənmiş məbləğ (AZN)
            <DecimalInput
              name="insurance_approved_amount"
              className="field mt-1"
              defaultValue={job?.insurance_approved_amount ?? ""}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
