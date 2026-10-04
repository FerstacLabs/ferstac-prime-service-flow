// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { financeReport } from "@/lib/reports/finance-report";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import {
  savedReconciliationReport,
  type ReconciliationDocument,
} from "@/lib/reconciliation";
import { cloneElement } from "react";
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

describe("account-partitioned journal balances", () => {
  it("keeps 1300 on an expense-only filtered row after opening 1000 and income 500", () => {
    const d = fixture();
    d.ledger = [
      entry("opening", {
        allocation_type: "OPENING_IN",
        amount: 1000,
        occurred_at: "2026-09-01T00:00:00Z",
      }),
      entry("income", { amount: 500, occurred_at: "2026-09-02T00:00:00Z" }),
      entry("expense", {
        amount: 200,
        direction: "OUT",
        occurred_at: "2026-09-03T00:00:00Z",
      }),
    ];
    const f = journalFilters({ direction: "OUT" });
    expect(filterLedger(d, f).map((t) => t.id)).toEqual(["expense"]);
    expect([...accountRunningBalances(d, f).values()]).toEqual([
      1000, 1500, 1300,
    ]);
    const report = financeReport(d, f)!;
    expect(report.sections[0].table?.rows[0].cells.balance).toBe(
      "1 300,00 AZN",
    );
  });
  it("partitions bank accounts, cash, transfers and reversals without a global balance", () => {
    const d = fixture();
    d.ledger = [
      entry("cash", { amount: 1000, occurred_at: "2026-09-01T00:00:00Z" }),
      entry("bank1", {
        channel: "BANK",
        financial_account_id: "b1",
        amount: 500,
        occurred_at: "2026-09-01T01:00:00Z",
      }),
      entry("bank2", {
        channel: "BANK",
        financial_account_id: "b2",
        amount: 700,
        occurred_at: "2026-09-01T02:00:00Z",
      }),
      entry("transfer-out", {
        allocation_type: "TRANSFER_OUT",
        direction: "OUT",
        amount: 100,
        occurred_at: "2026-09-01T03:00:00Z",
      }),
      entry("transfer-in", {
        allocation_type: "TRANSFER_IN",
        channel: "BANK",
        financial_account_id: "b2",
        amount: 100,
        occurred_at: "2026-09-01T03:00:00Z",
      }),
      entry("void", {
        direction: "OUT",
        amount: 100,
        voided_at: "2026-09-02",
        occurred_at: "2026-09-01T04:00:00Z",
      }),
    ];
    const b = accountRunningBalances(d, journalFilters({}));
    expect(b.get("cash")).toBe(1000);
    expect(b.get("bank1")).toBe(500);
    expect(b.get("bank2")).toBe(700);
    expect(b.get("transfer-out")).toBe(900);
    expect(b.get("transfer-in")).toBe(800);
    expect(b.get("void")).toBe(900);
    expect(
      accountRunningBalances(d, journalFilters({ worker: "hidden" })),
    ).toEqual(b);
  });
  it("uses frozen full-account balances when rendering a party-only archive", () => {
    const d = fixture();
    d.ledger = [
      entry("party", { direction: "OUT", amount: 200, account_balance: 1300 }),
    ];
    expect(accountRunningBalances(d, journalFilters({})).get("party")).toBe(
      1300,
    );
  });
  it("calculates general advances at period end rather than using today's remaining value", () => {
    const d = fixture();
    d.advances = [
      {
        id: "advance",
        worker_id: "worker",
        worker: "Rauf",
        amount: 300,
        remaining: 0,
        occurred_at: "2026-09-02",
        voided_at: null,
        channel: "CASH",
        reference_number: null,
      },
    ];
    d.advanceAllocations = [
      {
        id: "applied",
        advance_id: "advance",
        worker_id: "worker",
        work_item_id: "work",
        service_job_id: "job",
        amount: 100,
        created_at: "2026-09-05",
      },
      {
        id: "future",
        advance_id: "advance",
        worker_id: "worker",
        work_item_id: "work",
        service_job_id: "job",
        amount: 200,
        created_at: "2026-10-05",
      },
    ];
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
      report.summary.find(
        (s) => s.label === "Dövrün sonunda ümumi avans qalığı",
      )?.value,
    ).toContain("200,00");
    expect(report.sections.at(-1)?.signaturePositions).toBe(true);
  });
});
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
  it("shows opening events with their actor and account-specific running balances", () => {
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
    expect(accountRunningBalances(d, journalFilters({})).get("opening")).toBe(
      100,
    );
    expect(
      accountRunningBalances(d, journalFilters({ channel: "BANK" })).get(
        "bank-in",
      ),
    ).toBe(1000.25);
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
  it.each(["worker", "supplier"] as const)(
    "keeps internal balances out of fresh and legacy %s PDF/Print",
    async (kind) => {
      const data = fixture();
      data.ledger = data.ledger.map((row) => ({
        ...row,
        account_balance: 9876543.21,
      }));
      const report = financeReport(
        data,
        journalFilters({ reportType: kind, [kind]: kind }),
      )!;
      const secret = "9 876 543,21 AZN";
      expect(JSON.stringify(report)).not.toContain("Hesab üzrə qalıq");
      expect(JSON.stringify(report)).not.toContain(secret);
      const legacy = structuredClone(report);
      legacy.sections.push({
        title: "Köhnə ödəniş tarixçəsi",
        table: {
          columns: [
            { key: "out", label: "Məxaric" },
            { key: "balance", label: "Hesab üzrə qalıq" },
          ],
          rows: [
            {
              id: "legacy",
              cells: {
                out: "25,00 AZN",
                balance: secret,
                account_balance: secret,
              },
            },
          ],
        },
      });
      const original = JSON.stringify(legacy);
      for (const status of ["DRAFT", "CONFIRMED"] as const) {
        const saved = savedReconciliationReport({
          report_snapshot: legacy,
          created_at: "2026-10-04T08:00:00Z",
          status,
          confirmed_at: null,
          outdated: false,
          superseded_by: null,
        } as ReconciliationDocument)!;
        expect(saved.summary).toEqual(report.summary);
        if (kind === "supplier")
          expect(
            saved.sections[0].table?.columns.some(
              (c) => c.label === "Qalıq borc",
            ),
          ).toBe(true);
        for (const output of [report, saved]) {
          const html = renderToStaticMarkup(<PrintReport report={output} />);
          expect(html).not.toContain("Hesab üzrə qalıq");
          expect(html).not.toContain(secret);
          expect(JSON.stringify(output)).not.toContain(secret);
          let layout = "";
          await renderToBuffer(
            cloneElement(<ReportDocument report={output} />, {
              onRender: (result: { _INTERNAL__LAYOUT__DATA_: unknown }) => {
                layout = JSON.stringify(result._INTERNAL__LAYOUT__DATA_);
              },
            }),
          );
          expect(layout).not.toContain("Hesab üzrə qalıq");
          expect(layout).not.toContain(secret);
        }
      }
      expect(JSON.stringify(legacy)).toBe(original);
      const internal = financeReport(data, journalFilters({}))!;
      expect(JSON.stringify(internal)).toContain("Hesab üzrə qalıq");
      expect(renderToStaticMarkup(<PrintReport report={internal} />)).toContain(
        secret,
      );
    },
    20000,
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
