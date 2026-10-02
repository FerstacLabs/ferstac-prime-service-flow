// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { financeReport } from "@/lib/reports/finance-report";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import {
  filterLedger,
  accountRunningBalances,
  journalFilters,
  ledgerBalance,
  movementTotals,
  vehicleSettlement,
  type FinanceData,
  type LedgerEntry,
} from "@/lib/finance";

function entry(id: string, fields: Partial<LedgerEntry>): LedgerEntry {
  return {
    id,
    owner_user_id: "admin",
    service_job_id: null,
    allocation_type: "GENERAL_IN",
    work_item_id: null,
    purchase_id: null,
    direction: "IN",
    amount: 0,
    channel: "CASH",
    financial_account_id: null,
    currency: "AZN",
    payment_method: "CASH",
    category_id: null,
    purpose: "Ödəniş təyinatı",
    counterparty_name_snapshot: "Əli Məmmədov",
    counterparty_details: {},
    supplier_identity_id: null,
    worker_identity_id: null,
    reference_number: null,
    bank_reference: null,
    payment_order_number: null,
    supporting_reference: null,
    occurred_at: "2026-09-25T10:00:00Z",
    transaction_date: "2026-09-25",
    notes: null,
    voided_at: null,
    void_reason: null,
    transfer_id: null,
    created_by_name: "Kassir",
    ...fields,
  };
}
function fixture(): FinanceData {
  return {
    jobs: [
      {
        id: "job",
        job_no: "PR-707",
        plate: "99-FN-707",
        model: "BMW F30",
        customer_name: "Əli",
        customer_due: 500,
        missing_costs: 0,
        closed_at: null,
      },
    ],
    work: [
      {
        id: "work",
        service_job_id: "job",
        title: "Rəngsaz işi",
        worker_id: "worker",
        worker: "Rauf",
        status: "IN_PROGRESS",
        labor_cost: 500,
        labor_cost_known: true,
        is_additional: false,
      },
    ],
    purchases: [
      {
        id: "purchase",
        service_job_id: "job",
        title: "Qanad",
        cost: 700,
        source_type: "SUPPLIER",
        supplier_id: "supplier",
        supplier: "Sınaq Təchizat",
      },
    ],
    accounts: [
      {
        id: "bank",
        name: "Bank AZN",
        bank_name: "Bank",
        iban: "AZ123",
        currency: "AZN",
        account_holder: "PRIME",
        tax_id: null,
        swift: null,
        notes: null,
        active: true,
      },
    ],
    categories: [],
    ledger: [
      entry("cash-in", {
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: "job",
        amount: 500.5,
      }),
      entry("bank-in", {
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: "job",
        channel: "BANK",
        financial_account_id: "bank",
        amount: 1000.25,
        bank_reference: "TEST-BANK-001",
      }),
      entry("worker", {
        allocation_type: "WORKER_WORK_ITEM",
        service_job_id: "job",
        work_item_id: "work",
        worker_identity_id: "worker",
        amount: 200,
        direction: "OUT",
      }),
      entry("supplier", {
        allocation_type: "SUPPLIER_PURCHASE",
        service_job_id: "job",
        purchase_id: "purchase",
        supplier_identity_id: "supplier",
        amount: 300,
        direction: "OUT",
        channel: "BANK",
        financial_account_id: "bank",
      }),
      entry("fee", {
        allocation_type: "GENERAL_OUT",
        amount: 15.75,
        direction: "OUT",
        channel: "BANK",
        financial_account_id: "bank",
      }),
      entry("transfer-out", {
        allocation_type: "TRANSFER_OUT",
        amount: 1000,
        direction: "OUT",
        transfer_id: "transfer",
      }),
      entry("transfer-in", {
        allocation_type: "TRANSFER_IN",
        amount: 1000,
        channel: "BANK",
        financial_account_id: "bank",
        transfer_id: "transfer",
      }),
    ],
  };
}
describe("finance reconciliation and reports", () => {
  it("reconciles supplier exchange credit with the current payable projection", () => {
    const d = fixture();
    d.work = [];
    d.purchases = [
      {
        ...d.purchases[0],
        original_cost: 500,
        cost: 0,
        paid: 500,
        settled: 0,
        remaining: 0,
        purchase_date: "2026-09-01",
        returned: 500,
        credit_created: 500,
      },
      {
        ...d.purchases[0],
        id: "replacement",
        title: "Əvəz qanad",
        original_cost: 650,
        cost: 650,
        settled: 500,
        remaining: 150,
        credit_applied: 500,
        replacement_of: "purchase",
        purchase_date: "2026-09-25",
      },
    ];
    d.ledger = [
      entry("supplier", {
        allocation_type: "SUPPLIER_PURCHASE",
        direction: "OUT",
        purchase_id: "purchase",
        service_job_id: "job",
        supplier_identity_id: "supplier",
        amount: 500,
        transaction_date: "2026-09-10",
        occurred_at: "2026-09-10T10:00:00Z",
      }),
    ];
    d.purchaseReturns = [
      {
        id: "return",
        purchase_id: "purchase",
        service_job_id: "job",
        supplier_id: "supplier",
        quantity: 1,
        amount: 500,
        credit_amount: 500,
        paid_snapshot: 500,
        reason: "Dəyişmə",
        occurred_at: "2026-09-25T10:00:00Z",
        created_at: "2026-09-25T10:00:00Z",
        created_by: "admin",
        reference_number: "QA",
        replacement_purchase_id: "replacement",
        available: 0,
      },
    ];
    d.supplierCredits = [
      {
        id: "credit",
        return_id: "return",
        purchase_id: "replacement",
        service_job_id: "job",
        supplier_id: "supplier",
        amount: 500,
        created_at: "2026-09-25T10:00:00Z",
        created_by: "admin",
      },
    ];
    const report = financeReport(
      d,
      journalFilters({
        reportType: "supplier",
        supplier: "supplier",
        from: "2026-09-20",
        to: "2026-09-30",
      }),
    )!;
    expect(
      report.summary.find((s) => s.label === "Son qalıq borc")?.value,
    ).toContain("150,00");
    expect(vehicleSettlement(d, "job").remaining).toBe(150);
    expect(report.sections[0].table?.rows).toHaveLength(4);
    expect(report.sections.at(-1)?.signatureDates).toBe(true);
    expect(report.sections.at(-1)?.signatures).toHaveLength(2);
    expect(
      financeReport(
        d,
        journalFilters({
          reportType: "supplier",
          supplier: "supplier",
          worker: "unrelated",
        }),
      ),
    ).toBeNull();
    d.purchases[1].service_job_id = "other-job";
    d.supplierCredits[0].service_job_id = "other-job";
    const sourceReport = financeReport(
      d,
      journalFilters({
        reportType: "supplier",
        supplier: "supplier",
        job: "job",
      }),
    )!;
    expect(
      sourceReport.sections[0].table?.rows.some(
        (r) => r.cells.kind === "Kredit başqa avtomobilə tətbiq edilib",
      ),
    ).toBe(true);
    expect(
      sourceReport.summary.find((s) => s.label === "Son qalıq borc")?.value,
    ).toBe("0,00 AZN");
  });
  it("never injects unrelated full-history obligations into a filtered journal", () => {
    const d = fixture();
    d.advanceAllocations = [
      {
        id: "outside",
        advance_id: "x",
        work_item_id: "work",
        service_job_id: "job",
        worker_id: "worker",
        amount: 800,
        created_at: "2025-01-01",
      },
    ];
    const report = financeReport(
      d,
      journalFilters({
        worker: "worker",
        job: "job",
        from: "2026-09-25",
        to: "2026-09-25",
      }),
    )!;
    expect(report.sections.map((s) => s.title)).toEqual(["Əməliyyatlar"]);
    expect(report.sections[0].table?.rows).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("Müştəri qalıq borcu");
  });
  it("shows opening events with their actor and only single-account running balances", () => {
    const d = fixture();
    d.ledger.push(
      entry("opening", {
        allocation_type: "OPENING_IN",
        amount: 100,
        transaction_date: "2026-09-01",
        occurred_at: "2026-09-01T10:00:00Z",
      }),
    );
    const report = financeReport(
      d,
      journalFilters({ reportType: "opening", channel: "CASH" }),
    )!;
    expect(report.title).toBe("Başlanğıc qalıqlar");
    expect(report.sections[0].table?.rows.map((r) => r.id)).toEqual([
      "opening",
    ]);
    expect(report.sections[0].table?.rows[0].cells.actor).toBe("Kassir");
    expect(
      report.summary.find((s) => s.label === "Ümumi mədaxil")?.value,
    ).toContain("100,00");
    expect(accountRunningBalances(d, journalFilters({})).size).toBe(0);
    expect(
      accountRunningBalances(d, journalFilters({ channel: "BANK" })).size,
    ).toBe(0);
    expect(
      accountRunningBalances(
        d,
        journalFilters({ channel: "CASH", worker: "worker" }),
      ).get("opening"),
    ).toBe(100);
  });
  it("uses completion dates for worker reconciliation and keeps bonus outside debt", () => {
    const d = fixture();
    d.work[0].status = "DONE";
    d.work[0].completed_at = "2026-09-25T10:00:00Z";
    d.ledger.push(
      entry("bonus", {
        allocation_type: "GENERAL_OUT",
        amount: 100,
        direction: "OUT",
        worker_identity_id: "worker",
        counterparty_details: { payment_kind: "WORKER_BONUS" },
      }),
    );
    const report = financeReport(
      d,
      journalFilters({
        reportType: "worker",
        worker: "worker",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    )!;
    expect(
      report.summary.find((s) => s.label === "Əlavə ödəniş / bonus")?.value,
    ).toContain("100,00");
    expect(
      report.summary.find((s) => s.label === "Dövrün sonunda qalıq borc")
        ?.value,
    ).toContain("300,00");
    expect(report.sections.at(-1)?.signatures).toHaveLength(2);
    const prior = financeReport(
      d,
      journalFilters({
        reportType: "worker",
        worker: "worker",
        to: "2026-09-24",
      }),
    )!;
    expect(prior.sections[0].table?.rows).toHaveLength(0);
  });
  it("applies a general advance to debt without duplicating reported cash outflow", () => {
    const d = fixture();
    const before = movementTotals(d.ledger).expense;
    d.work[0].status = "DONE";
    d.work[0].applied_advance = 10;
    d.ledger.push(
      entry("advance", {
        allocation_type: "GENERAL_OUT",
        direction: "OUT",
        amount: 10,
        worker_identity_id: "worker",
        counterparty_name_snapshot: "Rauf",
        purpose: "Usta avansı",
      }),
    );
    d.advanceAllocations = [
      {
        id: "allocation",
        advance_id: "advance",
        work_item_id: "work",
        service_job_id: "job",
        worker_id: "worker",
        amount: 10,
        created_at: "2026-09-28T10:00:00Z",
      },
    ];
    expect(vehicleSettlement(d, "job").remaining).toBe(690);
    expect(movementTotals(d.ledger).expense).toBe(before + 10);
    const report = financeReport(d, journalFilters({ transaction: "advance" }));
    expect(
      report?.sections.some(
        (s) => s.title === "Ümumi avansın tətbiqi (pul çıxışı deyil)",
      ),
    ).toBe(true);
    expect(JSON.stringify(report)).toContain("Rəngsaz işi");
    expect(report?.summary).toHaveLength(1);
  });
  it("keeps source balances and business cashflow independent of transfers", () => {
    const d = fixture();
    expect(ledgerBalance(d.ledger.filter((t) => t.channel === "CASH"))).toBe(
      -699.5,
    );
    expect(ledgerBalance(d.ledger.filter((t) => t.channel === "BANK"))).toBe(
      1684.5,
    );
    expect(ledgerBalance(d.ledger)).toBe(985);
    expect(movementTotals(d.ledger)).toEqual({
      income: 1500.75,
      expense: 515.75,
      net: 985,
    });
  });
  it("subtracts actual cash plus bank allocations, without netting different creditors", () => {
    const d = fixture(),
      n = vehicleSettlement(d, "job");
    expect(n.totalCost).toBe(1200);
    expect(n.remaining).toBe(700);
    expect(n.cashPaid).toBe(200);
    expect(n.bankPaid).toBe(300);
    d.purchases[0].cost = 250;
    expect(vehicleSettlement(d, "job").remaining).toBe(300);
    expect(vehicleSettlement(d, "job").overpaid).toBe(50);
  });
  it("filters date, channel, direction, bank, party, job, worker, supplier and actor", () => {
    const d = fixture();
    expect(
      filterLedger(
        d,
        journalFilters({
          channel: "BANK",
          direction: "IN",
          account: "bank",
          job: "job",
          party: "məmməd",
          actor: "admin",
          from: "2026-09-25",
          to: "2026-09-25",
        }),
      ).map((t) => t.id),
    ).toEqual(["bank-in"]);
    expect(
      filterLedger(d, journalFilters({ supplier: "supplier" })).map(
        (t) => t.id,
      ),
    ).toEqual(["supplier"]);
    expect(
      filterLedger(d, journalFilters({ worker: "worker" })).map((t) => t.id),
    ).toEqual(["worker"]);
    expect(
      filterLedger(d, journalFilters({ category: "missing" })),
    ).toHaveLength(0);
    expect(
      filterLedger(d, journalFilters({ from: "2026-09-26" })),
    ).toHaveLength(0);
  });
  it("excludes opening and reversed entries from business totals, retaining original journal rows", () => {
    const d = fixture();
    d.ledger.push(
      entry("opening", { allocation_type: "OPENING_IN", amount: 500 }),
      entry("void", { amount: 100, voided_at: "2026-09-25" }),
    );
    expect(ledgerBalance(d.ledger)).toBe(1485);
    expect(movementTotals(d.ledger).net).toBe(985);
    expect(filterLedger(d, journalFilters({}))).toHaveLength(9);
  });
  it.each(["cash-in", "bank-in", "worker", "supplier"])(
    "renders a compact populated order %s without private quotes",
    async (id) => {
      const report = financeReport(
        fixture(),
        journalFilters({ transaction: id }),
      )!;
      expect(report.orientation).toBe("portrait");
      const html = renderToStaticMarkup(<PrintReport report={report} />);
      expect(html).toContain("Əli Məmmədov");
      expect(html).not.toMatch(/quoted_price|profit|Mənfəət/);
      const pdf = await renderToBuffer(<ReportDocument report={report} />);
      expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    },
  );
  it("renders a paginated dense Unicode ledger and filtered print", async () => {
    const d = fixture();
    d.ledger = Array.from({ length: 90 }, (_, i) =>
      entry("row" + i, {
        amount: 15.75,
        purpose: "Əlavə avtomobil xərcinin ödənilməsi",
        reference_number: "REF-" + i,
      }),
    );
    const report = financeReport(
      d,
      journalFilters({ channel: "CASH", from: "2026-09-25", to: "2026-09-25" }),
    )!;
    expect(report.sections.at(-1)!.table!.rows).toHaveLength(90);
    const html = renderToStaticMarkup(<PrintReport report={report} />);
    expect(html).toContain("REF-89");
    const pdf = await renderToBuffer(<ReportDocument report={report} />);
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g)!.length;
    expect(pages).toBeGreaterThan(1);
    expect(pages).toBeLessThan(10);
  }, 20000);
});
