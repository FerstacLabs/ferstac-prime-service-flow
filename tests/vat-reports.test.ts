import { describe, expect, it } from "vitest";
import { vatLedgerPosition, type VatLedgerEntry } from "@/lib/vat-ledger";
import { vatReport } from "@/lib/reports/vat-report";
import { journalFilters, ledgerBalance, type FinanceData } from "@/lib/finance";
import { workerCashFixture } from "./fixtures/worker-cash";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters } from "@/lib/filters";
import { jobFinance, purchaseDue } from "@/lib/workshop";
import { supplierFinance } from "@/lib/supplier-finance";

function entries(): VatLedgerEntry[] {
  return [
    ["OPENING", "IN", 50],
    ["CUSTOMER_RECEIPT", "IN", 18],
    ["SUPPLIER_PAYMENT", "OUT", 10],
  ].map(([kind, direction, amount], i) => ({
    id: String(i),
    posting_order: i + 1,
    kind: String(kind),
    direction: direction as "IN" | "OUT",
    amount: Number(amount),
    occurred_at: `2026-10-0${i + 5}T08:00:00Z`,
    created_by_name: "Admin",
    reference_number: `QA-${i}`,
    note: "QA",
    service_job_id: null,
    supplier_id: i === 2 ? "supplier" : null,
    cash_transaction_id: null,
    reversal_of: null,
  }));
}

describe("VAT UI and report accounting boundaries", () => {
  it("retains the full 58 deposit balance when only supplier -10 is visible", () => {
    const result = vatLedgerPosition(entries(), {
      vatKind: "SUPPLIER_PAYMENT",
    });
    expect(result.balance).toBe(58);
    expect(result.closing).toBe(58);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].balance).toBe(58);
    expect(
      vatLedgerPosition(entries(), { from: "2026-10-07", to: "2026-10-07" }),
    ).toMatchObject({ opening: 68, closing: 58 });
  });
  it("keeps same-timestamp chronology deterministic and uses Baku period boundaries", () => {
    const rows = entries().map((e) => ({
      ...e,
      occurred_at: "2026-10-06T20:30:00Z",
    }));
    expect(
      vatLedgerPosition(rows.reverse(), { from: "2026-10-07" }).rows.map(
        (r) => r.balance,
      ),
    ).toEqual([50, 68, 58]);
  });
  it("renders filtered VAT report without recalculating the deposit from selected rows", () => {
    const data = {
      jobs: [],
      work: [],
      purchases: [],
      ledger: [],
      accounts: [],
      categories: [],
      vatLedger: entries(),
    } as FinanceData;
    const report = vatReport(
      data,
      journalFilters({ vatKind: "SUPPLIER_PAYMENT" }),
    );
    expect(report.sections[0].table?.rows).toHaveLength(1);
    expect(report.sections[0].table?.rows[0].cells["0"]).toMatch(
      /^\d{2}\.\d{2}\.\d{4}/,
    );
    expect(JSON.stringify(report)).toContain("58,00");
    data.vatLedger![2].reference_number = "PR-2026-CFCD1DF22683-AL-6b83ade6";
    const wrapped = vatReport(
      data,
      journalFilters({ vatKind: "SUPPLIER_PAYMENT" }),
    );
    const reference = String(wrapped.sections[0].table!.rows[0].cells["4"]);
    expect(reference.replaceAll("\n", "")).toBe(
      data.vatLedger![2].reference_number,
    );
    expect(reference.split("\n").every((line) => line.length <= 16)).toBe(true);
  });
  it("isolates net operating money from gross payments", () => {
    expect(
      ledgerBalance([
        { direction: "IN", amount: 118, vat_amount: 18, voided_at: null },
      ] as FinanceData["ledger"]),
    ).toBe(100);
  });
  it("uses gross debt and net margin throughout workshop and supplier reports", () => {
    const d = workerCashFixture();
    const job = d.jobs[0];
    job.vat_enabled = true;
    const before = jobFinance(
      { ...job, vat_enabled: false },
      d.work,
      d.parts,
      d.purchases,
      d.cash,
    );
    const after = jobFinance(job, d.work, d.parts, d.purchases, d.cash);
    expect(after.quotedGross).toBe(after.quotedTotal + after.quotedVat);
    expect(after.grossProfit).toBe(before.grossProfit);
    expect(after.customerReceivable).toBe(
      before.customerReceivable + after.quotedVat,
    );
    const p = d.purchases[0];
    Object.assign(p, {
      vat_enabled: true,
      total_price: 100,
      net_amount: 100,
      vat_amount: 18,
      gross_amount: 118,
      remaining: 59,
      remaining_vat: 9,
      remaining_net: 50,
    });
    d.cash = d.cash.filter((t) => t.purchase_id !== p.id);
    const f = parseFilters({ visibility: "all" });
    const supplier = supplierFinance(d, f);
    expect(supplier.remaining).toBeGreaterThanOrEqual(59);
    expect(purchaseDue({ ...p, remaining: undefined }, [])).toBe(118);
    const report = buildWorkshopReport("purchases", d, f);
    expect(JSON.stringify(report)).toContain("ƏDV ödənilib");
    const worker = buildWorkshopReport("workers", d, f);
    expect(JSON.stringify(worker)).not.toContain("ƏDV");
  });
});
