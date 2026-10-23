import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewMovement } from "@/components/finance-forms";
import type { FinanceData, FinanceJob } from "@/lib/finance";

const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/app/actions/ledger", () => ({ recordLedgerAction: record }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("explains discounted customer totals and prior payments without recording a transaction", () => {
  const job: FinanceJob = {
    id: "qa-job", job_no: "QA-015", plate: "90-DS-015", model: "QA",
    customer_name: "QA", customer_due: 531, missing_costs: 0, closed_at: null,
    discount_type: "PERCENT", discount_value: 10, before_discount: 1000,
    discount_amount: 100, net_quotation: 900, vat_quotation: 162,
    gross_quotation: 1062, vat_enabled: true,
  };
  const data = { jobs: [job], accounts: [], categories: [], workers: [], work: [] } as unknown as FinanceData;
  render(<NewMovement data={data} direction="IN" channel="CASH" job={job} />);
  fireEvent.click(screen.getByRole("button", { name: "Müştəridən ödəniş qəbul et" }));
  for (const [label, value] of [
    ["Endirimdən əvvəl (ƏDV-siz)", "1 000,00 ₼"],
    ["Müştəri endirimi", "100,00 ₼"],
    ["Müştəri yekun məbləği", "1 062,00 ₼"],
    ["Alınmış ödənişlər", "531,00 ₼"],
    ["Müştərinin qalıq borcu", "531,00 ₼"],
  ]) {
    expect(screen.getByText(label).nextElementSibling?.textContent).toBe(value);
  }
  const amount = screen.getByLabelText("Yekun ödəniş (ƏDV daxil, AZN)") as HTMLInputElement;
  fireEvent.change(amount, { target: { value: "532" } });
  fireEvent.blur(amount);
  expect(amount.validity.customError).toBe(true);
  fireEvent.change(amount, { target: { value: "531" } });
  fireEvent.blur(amount);
  expect(amount.validity.customError).toBe(false);
  expect(record).not.toHaveBeenCalled();
});
