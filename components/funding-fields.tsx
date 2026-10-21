"use client";
import { useDraftState } from "@/components/form-draft";
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
  const [source, setSource] = useDraftState("funding:source",
    job?.funding_source ?? "CUSTOMER_FUNDED",
  );
  const [company, setCompany] = useDraftState("funding:company", job?.insurance_company ?? "");
  const [claim, setClaim] = useDraftState("funding:claim", job?.insurance_claim_no ?? "");
  const [approved, setApproved] = useDraftState("funding:approved", String(job?.insurance_approved_amount ?? ""));
  return (
    <>
      <label className="text-sm text-[var(--muted)]">
        Mənbə
        <select
          name="funding_source"
          data-draft-managed
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
              data-draft-managed
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Sığorta işi / claim nömrəsi
            <input
              name="insurance_claim_no"
              className="field mt-1"
              data-draft-managed
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Sığorta tərəfindən təsdiqlənmiş məbləğ (AZN)
            <DecimalInput
              name="insurance_approved_amount"
              className="field mt-1"
              data-draft-managed
              value={approved}
              onChange={(e) => setApproved(e.target.value)}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
