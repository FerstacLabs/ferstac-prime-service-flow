// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/queries", () => ({ getAuthedSupabase: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  redirect: vi.fn(),
}));
import { recordLedgerAction } from "@/app/actions/ledger";
import { savePurchaseAction } from "@/app/actions/purchases";

const job = "11111111-1111-4111-a111-111111111111";
const purchase = "22222222-2222-4222-a222-222222222222";
const key = "33333333-3333-4333-a333-333333333333";
let category: { name: string; direction: string; active: boolean };
let paid: string;
let prior: { id: string } | null;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.set(k, v));
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  category = { name: "Müştəri avansı", direction: "IN", active: true };
  paid = "0";
  prior = null;
  mocks.auth.mockResolvedValue({
    supabase: { rpc: mocks.rpc, from: mocks.from },
    user: { id: key },
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "save_workshop_purchase" ? purchase : key,
    error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.single.mockResolvedValue({
      data:
        table === "transaction_categories"
          ? category
          : { paid_amount: paid, gross_amount: "708" },
      error: null,
    });
    q.maybeSingle.mockResolvedValue({ data: prior, error: null });
    return q;
  });
});
const income = () =>
  form({
    allocation_type: "GENERAL_IN",
    category_id: key,
    service_job_id: job,
    amount: "590",
    channel: "CASH",
    occurred_at: "2026-10-11T12:00",
    idempotency_key: key,
  });
const buy = (status: string) =>
  form({
    service_job_id: job,
    source_type: "SUPPLIER",
    supplier_id: key,
    quantity: "1",
    unit_price: "600",
    vat_enabled: "true",
    payment_status: status,
    paid_amount: "354",
    purchased_by: "admin",
    purchase_date: "2026-10-11",
    payment_at: "2026-10-11T12:00",
    channel: "CASH",
    idempotency_key: key,
  });

describe("canonical payment actions", () => {
  it.each(["Müştəri avansı", "Müştəri ödənişi"])(
    "routes server-resolved %s through one canonical payment RPC",
    async (name) => {
      category.name = name;
      expect(await recordLedgerAction(income())).toBeUndefined();
      expect(mocks.auth).toHaveBeenCalledWith("ADMIN", "CASHIER");
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        "record_financial_transaction",
        expect.objectContaining({
          p_key: key,
          p_data: expect.objectContaining({
            allocation_type: "CUSTOMER_VEHICLE",
            service_job_id: job,
            category_id: key,
            amount: "590.00",
          }),
        }),
      );
    },
  );
  it("does not reinterpret generic income just because a job is selected", async () => {
    category.name = "Digər gəlir";
    await recordLedgerAction(income());
    expect(mocks.rpc.mock.calls[0][1].p_data.allocation_type).toBe(
      "GENERAL_IN",
    );
  });
  it("requires a canonical job for a customer advance", async () => {
    const f = income();
    f.delete("service_job_id");
    expect(await recordLedgerAction(f)).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects inactive categories before writing money", async () => {
    category.active = false;
    expect(await recordLedgerAction(income())).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([recordLedgerAction, savePurchaseAction])(
    "cannot bypass server-side role protection",
    async (action) => {
      mocks.auth.mockRejectedValue(new Error("İcazə yoxdur."));
      expect(await action(income())).toHaveProperty("error");
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["UNPAID", null],
    ["PARTIAL", "354.00"],
    ["PAID", "708.00"],
  ])(
    "saves VAT purchase %s without legacy cash or duplicated VAT writes",
    async (status, amount) => {
      expect(await savePurchaseAction(buy(status!))).toBeUndefined();
      expect(mocks.auth).toHaveBeenCalledWith("ADMIN");
      expect(mocks.rpc.mock.calls[0]).toEqual([
        "save_workshop_purchase",
        expect.objectContaining({
          p_key: key,
          p_data: expect.objectContaining({
            payment_status: "UNPAID",
            paid_amount: "0.00",
            vat_enabled: true,
          }),
        }),
      ]);
      expect(mocks.rpc).toHaveBeenCalledTimes(amount ? 2 : 1);
      if (amount)
        expect(mocks.rpc.mock.calls[1]).toEqual([
          "record_financial_transaction",
          expect.objectContaining({
            p_key: expect.not.stringMatching(key),
            p_data: expect.objectContaining({
              allocation_type: "SUPPLIER_PURCHASE",
              service_job_id: job,
              target_id: purchase,
              amount,
            }),
          }),
        ]);
    },
  );
  it("keeps a saved unpaid purchase and reports a failed atomic payment for retry", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: purchase,
      error:
        name === "record_financial_transaction"
          ? { message: "ƏDV depozitində kifayət qədər vəsait yoxdur." }
          : null,
    }));
    const result = await savePurchaseAction(buy("PAID"));
    expect(result?.error).toContain("Alış saxlanıldı, ödəniş edilmədi");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("uses the same payment key on retry and skips an already posted payment", async () => {
    await savePurchaseAction(buy("PARTIAL"));
    const firstKey = mocks.rpc.mock.calls[1][1].p_key;
    mocks.rpc.mockClear();
    await savePurchaseAction(buy("PARTIAL"));
    expect(mocks.rpc.mock.calls[1][1].p_key).toBe(firstKey);
    mocks.rpc.mockClear();
    prior = { id: key };
    await savePurchaseAction(buy("PARTIAL"));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("only pays the remaining portion when completing a partial purchase", async () => {
    paid = "354";
    await savePurchaseAction(buy("PAID"));
    expect(mocks.rpc.mock.calls[1][1].p_data.amount).toBe("354.00");
  });
  it("preserves bank account, method and reference in the canonical payment", async () => {
    const f = buy("PAID");
    f.set("channel", "BANK");
    f.set("financial_account_id", job);
    f.set("payment_method", "TRANSFER");
    f.set("bank_reference", "BANK-REF");
    await savePurchaseAction(f);
    expect(mocks.rpc.mock.calls[1][1].p_data).toMatchObject({
      channel: "BANK",
      financial_account_id: job,
      payment_method: "TRANSFER",
      bank_reference: "BANK-REF",
      amount: "708.00",
    });
  });
  it("does not silently erase an existing settlement by choosing unpaid", async () => {
    paid = "354";
    const f = buy("UNPAID");
    f.set("id", purchase);
    expect(await savePurchaseAction(f)).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
