import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PurchaseEntry } from "@/components/purchase-entry";
import { WorkerCostForm } from "@/components/job-finance";
import { IntakeDateInput } from "@/components/intake-date-input";
import { FundingFields } from "@/components/funding-fields";
import { workerCashFixture } from "./fixtures/worker-cash";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/app/actions/finance", () => ({
  recordPaymentAction: vi.fn(),
  setWorkerCostAction: vi.fn(),
  voidPaymentAction: vi.fn(),
  createCatalogAction: vi.fn(),
}));
vi.mock("@/app/actions/purchases", () => ({ savePurchaseAction: vi.fn() }));
afterEach(cleanup);
describe("intake notes and date inputs", () => {
  it("shows part cost note and measures next to actual total cost without multiplying by quoted quantity", () => {
    const part = {
      ...workerCashFixture().parts[0],
      quantity: 2.5,
      customer_unit_price: 100.4,
      quoted_price: 251,
      notes: "Normal part note",
      cost_note: "Internal part instruction",
      unit_catalog: { id: "unit", name: "Litr" },
    };
    const { container } = render(
      <PurchaseEntry jobId="job" part={part} suppliers={[]} workers={[]} />,
    );
    expect(screen.getByText("Internal part instruction")).toBeTruthy();
    expect(screen.getByText(/2,5 Litr/)).toBeTruthy();
    expect(screen.getByText("Normal part note")).toBeTruthy();
    expect(
      (container.querySelector('[name="quantity"]') as HTMLInputElement).value,
    ).toBe("1");
    expect(
      screen.getByLabelText("Faktiki maya, cəmi (AZN)").getAttribute("type"),
    ).toBe("text");
  });
  it("shows work cost note beside worker cost input", () => {
    const work = {
      ...workerCashFixture().work[0],
      quantity: 2.5,
      customer_unit_price: 100.4,
      cost_note: "Internal worker instruction",
      notes: "Customer work note",
    };
    render(<WorkerCostForm work={work} paid={0} />);
    expect(screen.getByText("Internal worker instruction")).toBeTruthy();
    expect(screen.getByText("Customer work note")).toBeTruthy();
    expect(
      screen.getByLabelText("Usta maya dəyəri").getAttribute("inputmode"),
    ).toBe("decimal");
  });
  it("normalizes ISO pasted date on blur without a mouse-only picker", () => {
    render(
      <label>
        Qəbul tarixi
        <IntakeDateInput name="received_at" />
      </label>,
    );
    const input = screen.getByLabelText("Qəbul tarixi") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-09-30" } });
    fireEvent.blur(input);
    expect(input.value).toBe("09/30/2026");
    expect(input.type).toBe("text");
  });
  it("shows optional insurance amount only for insurance funding", () => {
    const { container } = render(<FundingFields />);
    expect(
      container.querySelector('[name="insurance_approved_amount"]'),
    ).toBeNull();
    fireEvent.change(container.querySelector('[name="funding_source"]')!, {
      target: { value: "INSURANCE_CLAIM" },
    });
    const amount = screen.getByLabelText(
      "Sığorta tərəfindən təsdiqlənmiş məbləğ (AZN)",
    ) as HTMLInputElement;
    expect(amount.required).toBe(false);
  });
});
