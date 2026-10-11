// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { workerCashFixture } from "./fixtures/worker-cash";
import { jobFinance } from "@/lib/workshop";
import {
  filterLedger,
  journalFilters,
  vehicleSettlement,
  ledgerBalance,
  type FinanceData,
  type LedgerEntry,
} from "@/lib/finance";
import { financeReport } from "@/lib/reports/finance-report";
import { PrintReport } from "@/components/reports/print-report";
import { ReportDocument } from "@/lib/report-pdf";

function fixture(
  vat = false,
  amount = 200,
): { finance: FinanceData; workshop: ReturnType<typeof workerCashFixture> } {
  const d = workerCashFixture();
  d.jobs = [d.jobs[0]];
  d.jobs[0].vat_enabled = vat;
  d.work = [{ ...d.work[0], quoted_price: 1000 }];
  d.parts = [];
  d.purchases = [];
  const tx: LedgerEntry = {
    ...d.cash[0],
    id: "advance",
    allocation_type: "CUSTOMER_VEHICLE",
    amount,
    vat_amount: vat ? 90 : 0,
    net_amount: vat ? 500 : 200,
    channel: "CASH",
    financial_account_id: null,
    purpose: "Müştəri avansı",
    occurred_at: "2026-10-11T08:00:00Z",
    category_id: "advance",
    counterparty_name_snapshot: "Test müştəri",
    reference_number: "LINK-ADVANCE",
    currency: "AZN",
    payment_method: "CASH",
    owner_user_id: "admin",
    created_by_name: "Admin",
    supplier_identity_id: null,
    worker_identity_id: null,
    bank_reference: null,
    payment_order_number: null,
    supporting_reference: null,
    transfer_id: null,
    counterparty_details: {},
  };
  d.cash = [
    {
      ...d.cash[0],
      ...tx,
      service_job_id: "job",
      allocation_type: "CUSTOMER_VEHICLE",
    },
  ];
  return {
    workshop: d,
    finance: {
      jobs: [
        {
          id: "job",
          plate: "DISPLAY-ONLY",
          job_no: "DISPLAY-ONLY",
          model: "",
          customer_name: "Test",
          customer_due: (vat ? 1180 : 1000) - amount,
          missing_costs: 0,
          closed_at: null,
        },
      ],
      work: [],
      purchases: [],
      accounts: [],
      categories: [],
      ledger: [tx],
    },
  };
}
describe("one persisted job and ledger source across finance/report views", () => {
  it.each([
    [false, 200, 800],
    [true, 590, 590],
  ] as const)(
    "counts VAT=%s advance once across all selectors",
    (vat, amount, debt) => {
      const { workshop: d, finance: f } = fixture(vat, amount);
      const n = jobFinance(d.jobs[0], d.work, d.parts, d.purchases, d.cash);
      expect(n.customerPaid).toBe(amount);
      expect(n.customerReceivable).toBe(debt);
      expect(vehicleSettlement(f, "job").cashReceived).toBe(amount);
      expect(
        filterLedger(f, journalFilters({ job: "job" })).map((t) => t.id),
      ).toEqual(["advance"]);
      expect(ledgerBalance(f.ledger)).toBe(vat ? 500 : amount);
      // Work and source IDs on the same row must not create another receipt.
      f.ledger[0].work_item_id = "work";
      f.ledger[0].reference_number = "other-plate";
      f.jobs[0].plate = "RENAMED";
      d.jobs[0].vehicles!.plate = "RENAMED";
      expect(vehicleSettlement(f, "job").cashReceived).toBe(amount);
      expect(filterLedger(f, journalFilters({ job: "job" }))).toHaveLength(1);
    },
  );
  it("does not count historical general income or unrelated jobs as customer receipts", () => {
    const { workshop: d, finance: f } = fixture();
    const old = {
      ...f.ledger[0],
      id: "historical",
      allocation_type: "GENERAL_IN" as const,
      amount: 999,
    };
    const foreign = { ...f.ledger[0], id: "other", service_job_id: "other" };
    f.ledger.push(old, foreign);
    d.cash.push(
      { ...d.cash[0], ...old, service_job_id: "job" },
      { ...d.cash[0], ...foreign, allocation_type: "CUSTOMER_VEHICLE" },
    );
    expect(
      jobFinance(d.jobs[0], d.work, d.parts, d.purchases, d.cash).customerPaid,
    ).toBe(200);
    expect(vehicleSettlement(f, "job").cashReceived).toBe(200);
    expect(
      filterLedger(f, journalFilters({ job: "job" }))
        .map((t) => t.id)
        .sort(),
    ).toEqual(["advance", "historical"]);
  });
  it.each(["vehicle", "journal"])(
    "renders the same advance in %s PDF/Print model",
    async (reportType) => {
      const { finance } = fixture(true, 590);
      const report = financeReport(
        finance,
        journalFilters({ job: "job", reportType }),
      )!;
      const rows = report.sections.flatMap((s) => s.table?.rows ?? []);
      expect(rows.filter((r) => r.id === "advance")).toHaveLength(1);
      expect(JSON.stringify(report)).toContain("LINK-ADVANCE");
      if (reportType === "vehicle")
        expect(
          report.sections
            .flatMap((s) => s.fields ?? [])
            .find((f) => f.label === "Müştəridən nağd alınıb")?.value,
        ).toContain("590,00");
      expect(renderToStaticMarkup(<PrintReport report={report} />)).toContain(
        "LINK-ADVANCE",
      );
      const pdf = await renderToBuffer(<ReportDocument report={report} />);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    },
  );
});
