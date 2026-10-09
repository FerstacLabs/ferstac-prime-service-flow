// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { workerCashFixture } from "./fixtures/worker-cash";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import { financeReport } from "@/lib/reports/finance-report";
import { journalFilters, type FinanceData } from "@/lib/finance";
import { parseFilters } from "@/lib/filters";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import { FinancePage } from "@/components/finance-page";
import { PurchaseEntry } from "@/components/purchase-entry";
import { VatMode } from "@/components/vat-mode";
import { IntakeQuotes } from "@/components/quote-editor";
import { PurchaseList } from "@/components/purchase-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

describe("VAT document rendering and local visual fixtures", () => {
  it.each([true, false])(
    "shows purchase history net/VAT/gross with VAT mode %s",
    (enabled) => {
      const data = workerCashFixture();
      const purchase = {
        ...data.purchases[0],
        vat_enabled: enabled,
        net_amount: 100,
        total_price: 100,
        vat_amount: enabled ? 18 : 0,
        gross_amount: enabled ? 118 : 100,
      };
      const html = renderToStaticMarkup(
        <PurchaseList data={data} items={[purchase]} />,
      );
      expect(html).toContain("ƏDV-siz məbləğ");
      expect(html).toContain("Yekun məbləğ");
      expect(html).toContain("100,00");
      expect(html).toContain(enabled ? "18,00" : "0,00");
      expect(html).toContain(enabled ? "118,00" : "100,00");
    },
  );
  it("renders internal VAT reports and private supplier/worker documents", async () => {
    const d = workerCashFixture();
    d.jobs[0].vat_enabled = true;
    d.suppliers = [
      {
        id: "supplier",
        company_name: "Sınaq Təchizat MMC",
        active: true,
        tax_id_voen: "QA",
      },
    ] as typeof d.suppliers;
    d.purchases = [
      {
        ...d.purchases[0],
        supplier_id: "supplier",
        vat_enabled: true,
        quantity: 1,
        unit_price: 100,
        total_price: 100,
        net_amount: 100,
        vat_amount: 18,
        gross_amount: 118,
        remaining: 59,
        remaining_net: 50,
        remaining_vat: 9,
        suppliers: d.suppliers[0],
      },
    ];
    d.cash = [
      {
        ...d.cash.find((t) => t.allocation_type === "SUPPLIER_PURCHASE")!,
        amount: 59,
        net_amount: 50,
        vat_amount: 9,
      },
    ];
    const finance: FinanceData = {
      jobs: [
        {
          id: "job",
          job_no: "PR-QA",
          plate: "99-VT-014",
          model: "BMW QA",
          customer_name: "Sınaq müştəri",
          customer_due: 0,
          missing_costs: 0,
          closed_at: null,
        },
      ],
      work: [],
      purchases: [
        {
          id: "purchase",
          service_job_id: "job",
          title: "Sağ ön qanad",
          cost: 100,
          original_cost: 100,
          supplier_id: "supplier",
          supplier: "Sınaq Təchizat MMC",
          source_type: "SUPPLIER",
          purchase_date: "2026-09-19",
          paid: 59,
          settled: 59,
          remaining: 59,
          vat_enabled: true,
          net_amount: 100,
          vat_amount: 18,
          gross_amount: 118,
          remaining_net: 50,
          remaining_vat: 9,
        },
      ],
      ledger: [
        {
          ...d.cash[0],
          occurred_at: "2026-09-20T08:00:00Z",
          transaction_date: "2026-09-20",
          owner_user_id: "admin",
          channel: "CASH",
          currency: "AZN",
          financial_account_id: null,
          supplier_identity_id: "supplier",
          worker_identity_id: null,
          counterparty_details: {},
          counterparty_name_snapshot: "Sınaq Təchizat MMC",
          purpose: "Qanad alışı",
          reference_number: "QA-1",
          category_id: null,
          created_by_name: "Admin",
          payment_method: "CASH",
          bank_reference: null,
          payment_order_number: null,
          supporting_reference: null,
          transfer_id: null,
        },
      ],
      accounts: [],
      categories: [],
      vatLedger: [
        {
          id: "opening",
          posting_order: 1,
          kind: "OPENING",
          direction: "IN",
          amount: 50,
          occurred_at: "2026-09-19T08:00:00Z",
          created_by_name: "Admin",
          reference_number: "VAT-OPEN",
          note: "Başlanğıc",
          cash_transaction_id: null,
          reversal_of: null,
          service_job_id: null,
          supplier_id: null,
        },
        {
          id: "paid",
          posting_order: 2,
          kind: "SUPPLIER_PAYMENT",
          direction: "OUT",
          amount: 9,
          occurred_at: "2026-09-20T08:00:00Z",
          created_by_name: "Kassa",
          reference_number: "QA-1",
          note: "ƏDV ödənişi",
          cash_transaction_id: "supplier",
          reversal_of: null,
          service_job_id: "job",
          supplier_id: "supplier",
          party: "Sınaq Təchizat MMC",
          plate: "99-VT-014",
          channel: "CASH",
        },
      ],
    };
    d.vatLedger = finance.vatLedger;
    const reports = {
      vat: financeReport(finance, journalFilters({ reportType: "vat" }))!,
      "supplier-vat": buildWorkshopReport("suppliers", d, parseFilters({})),
      "supplier-reconciliation-vat": financeReport(
        finance,
        journalFilters({ reportType: "supplier", supplier: "supplier" }),
      )!,
      "overview-vat": buildWorkshopReport("overview", d, parseFilters({})),
      "purchases-vat": buildWorkshopReport("purchases", d, parseFilters({})),
      "worker-no-vat": buildWorkshopReport("workers", d, parseFilters({})),
    };
    for (const [name, report] of Object.entries(reports)) {
      expect(report).toBeTruthy();
      const html = renderToStaticMarkup(<PrintReport report={report} />);
      const pdf = await renderToBuffer(<ReportDocument report={report} />);
      expect(pdf.byteLength).toBeGreaterThan(10000);
      if (name === "worker-no-vat") expect(html).not.toContain("ƏDV");
      if (name === "supplier-reconciliation-vat") {
        expect(html).toContain("ƏDV bölgüsü");
        expect(html).not.toContain("ƏDV depozit");
        expect(html).not.toContain("Hesab üzrə qalıq");
        expect(html).toContain("59,00");
      }
      if (process.env.PRIME_REPORT_QA_DIR) {
        mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `${name}.pdf`),
          pdf,
        );
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `${name}.html`),
          html,
        );
      }
    }
    if (process.env.PRIME_REPORT_QA_DIR) {
      const screens = {
        "kassa-operations-vat": (
          <FinancePage data={finance} params={{}} admin />
        ),
        "kassa-vat": (
          <FinancePage
            data={finance}
            params={{ view: "reports", reportType: "vat" }}
            admin
          />
        ),
        "purchase-vat": (
          <PurchaseEntry
            jobId="job"
            purchase={d.purchases[0]}
            suppliers={[{ id: "supplier", name: "Sınaq Təchizat MMC" }]}
            workers={[]}
          />
        ),
        "intake-vat": (
          <form>
            <IntakeQuotes
              work={[]}
              parts={[]}
              units={[{ id: "unit", name: "Ədəd" }]}
            />
          </form>
        ),
        "edit-vat": (
          <form>
            <VatMode initial />
          </form>
        ),
      };
      for (const [name, screen] of Object.entries(screens))
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `${name}.html`),
          renderToStaticMarkup(screen),
        );
    }
  }, 30000);
});
