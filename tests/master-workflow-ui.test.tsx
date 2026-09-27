import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinancePage } from "@/components/finance-page";
import { WorkshopFilters } from "@/components/workshop-filters";
import { parseFilters } from "@/lib/filters";
import type { FinanceData } from "@/lib/finance";

vi.mock("@/components/app-shell", () => ({
  PageHeader: ({ actions }: { actions: React.ReactNode }) => (
    <header>{actions}</header>
  ),
}));
vi.mock("@/components/job-finance", () => ({ MoneyGrid: () => null }));
vi.mock("@/components/finance-forms", () => ({
  NewMovement: () => <button>Yeni əməliyyat</button>,
  TransferForm: () => null,
  SettlementDialog: () => <button>Hesablaşmanı aç</button>,
}));
vi.mock("@/components/master-lifecycle", () => ({
  MasterLifecycle: () => null,
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
vi.mock("@/components/filter-form", () => ({
  FilterForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
vi.mock("@/app/actions/ledger", () => ({
  saveFinancialMasterAction: vi.fn(),
  reopenVehicleAction: vi.fn(),
}));
vi.mock("@/app/actions/finance", () => ({
  voidPaymentAction: vi.fn(),
  createCatalogAction: vi.fn(),
}));
vi.mock("@/components/report-actions", () => ({
  ReportActions: () => <a href="/report">Ümumi PDF</a>,
}));
afterEach(cleanup);
const data: FinanceData = {
  accounts: [],
  categories: [],
  work: [],
  purchases: [],
  ledger: [],
  jobs: [
    {
      id: "filter",
      plate: "99-BZ-312",
      job_no: "FILTER",
      model: "BMW",
      customer_name: "Filter",
      customer_due: 10,
      missing_costs: 0,
      closed_at: null,
    },
    {
      id: "operation",
      plate: "77-AH-118",
      job_no: "OPERATION",
      model: "BMW",
      customer_name: "Operation",
      customer_due: 10,
      missing_costs: 0,
      closed_at: null,
    },
  ],
};
describe("master workflow state separation", () => {
  it.each(["operations", "reports"])(
    "never opens settlement from a %s vehicle filter",
    (view) => {
      render(
        <FinancePage data={data} params={{ view, job: "filter" }} admin />,
      );
      expect(
        screen.queryByRole("button", { name: "Hesablaşmanı aç" }),
      ).toBeNull();
      expect(screen.queryByLabelText("Avtomobil / servis kartı")).toBeNull();
    },
  );
  it("uses only the explicit settlement vehicle", () => {
    render(
      <FinancePage
        data={data}
        params={{
          view: "settlement",
          job: "filter",
          settlementJob: "operation",
        }}
        admin
      />,
    );
    expect(
      screen.getByRole("heading", { name: "77-AH-118 · BMW" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "99-BZ-312 · BMW" }),
    ).toBeNull();
  });
  it("resets uncontrolled visible filters and preserves operation selection in reset URL", () => {
    const { rerender } = render(
      <FinancePage
        data={data}
        params={{
          view: "reports",
          job: "filter",
          party: "QA",
          settlementJob: "operation",
        }}
        admin
      />,
    );
    fireEvent.change(screen.getByLabelText("Tərəf"), {
      target: { value: "unsaved" },
    });
    expect(
      screen.getByRole("link", { name: "Sıfırla" }).getAttribute("href"),
    ).toBe("/kassa?view=reports&settlementJob=operation");
    rerender(
      <FinancePage
        data={data}
        params={{ view: "reports", settlementJob: "operation" }}
        admin
      />,
    );
    expect((screen.getByLabelText("Tərəf") as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByLabelText("Avtomobil") as HTMLSelectElement).value,
    ).toBe("");
  });
  it("keeps general reporting only in Reports and hides ADMIN management from CASHIER", () => {
    const { rerender } = render(
      <FinancePage data={data} params={{}} admin={false} />,
    );
    expect(screen.queryByRole("link", { name: "Ümumi PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Bank hesabları" })).toBeNull();
    rerender(
      <FinancePage data={data} params={{ view: "reports" }} admin={false} />,
    );
    expect(screen.getByRole("link", { name: "Ümumi PDF" })).toBeTruthy();
  });
  it("resets purchase history fields without dropping purchase/costing selections", () => {
    const fixed = { purchaseJob: "operation", costingJob: "costing" };
    const { rerender, container } = render(
      <WorkshopFilters
        scope="purchases"
        filters={parseFilters({ payment: "UNPAID", from: "2026-09-01" })}
        fixed={fixed}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Filtrləri sıfırla" })
        .getAttribute("href"),
    ).toBe("?purchaseJob=operation&costingJob=costing");
    rerender(
      <WorkshopFilters
        scope="purchases"
        filters={parseFilters({})}
        fixed={fixed}
      />,
    );
    expect((screen.getByLabelText("Ödəniş") as HTMLSelectElement).value).toBe(
      "",
    );
    expect((screen.getByLabelText("Başlanğıc") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (container.querySelector("[name=purchaseJob]") as HTMLInputElement).value,
    ).toBe("operation");
  });
});
