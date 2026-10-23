import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionForm } from "@/components/action-form";
import { DraftSession, useDraftState } from "@/components/form-draft";
import { IntakeDateInput } from "@/components/intake-date-input";
import { FundingFields } from "@/components/funding-fields";
import { PurchaseEntry } from "@/components/purchase-entry";
import { IntakeQuotes } from "@/components/quote-editor";
vi.mock("@/app/actions/purchases", () => ({ savePurchaseAction: vi.fn(async () => {}) }));
vi.mock("@/app/actions/finance", () => ({ createCatalogAction: vi.fn() }));
vi.mock("@/app/actions/ledger", () => ({}));
vi.mock("@/components/app-shell", () => ({ statusLabels: {} }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
function Rows() {
  const [rows, setRows] = useDraftState<string[]>("rows", []);
  return <><button type="button" onClick={() => setRows([...rows, `work ${rows.length + 1}`])}>Add</button>
    {rows.map((row, i) => <input key={i} aria-label={`row ${i}`} value={row}
      onChange={(e) => setRows(rows.map((v, n) => n === i ? e.target.value : v))} />)}</>;
}
function Form({ scope = "org:user:INTAKE:session1", id = "vehicle:new", action = async () => {} }: {
  scope?: string; id?: string; action?: (form: FormData) => Promise<void | { error: string }>;
}) {
  return <DraftSession scope={scope}><ActionForm draftKey={id} action={action}>
    <input name="customer_name" aria-label="customer" />
    <input name="password" type="password" aria-label="password" />
    <IntakeDateInput name="received_at" />
    <FundingFields /><Rows /><button type="submit">Save</button>
  </ActionForm></DraftSession>;
}
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("session-scoped form drafts", () => {
  it("restores native fields, dates, conditional funding and four dynamic rows after navigation", () => {
    const first = render(<Form />);
    fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Draft customer" } });
    fireEvent.change(screen.getByPlaceholderText("GG/AA/İİİİ"), { target: { value: "20/10/2026" } });
    fireEvent.change(screen.getByLabelText("Mənbə"), { target: { value: "INSURANCE_CLAIM" } });
    fireEvent.change(screen.getByLabelText("Sığorta şirkəti"), { target: { value: "Test insurance" } });
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Add"));
    first.unmount();
    render(<Form />);
    expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("Draft customer");
    expect((screen.getByPlaceholderText("GG/AA/İİİİ") as HTMLInputElement).value).toBe("20/10/2026");
    expect((document.querySelector('[name="received_at"]') as HTMLInputElement).value).toBe("2026-10-20");
    expect((screen.getByLabelText("Sığorta şirkəti") as HTMLInputElement).value).toBe("Test insurance");
    expect(screen.getAllByLabelText(/^row /)).toHaveLength(4);
  });
  it.each(["org:other:INTAKE:session1", "org:user:ADMIN:session1", "other:user:INTAKE:session1", "org:user:INTAKE:session2"])(
    "isolates scope %s", (scope) => {
      const first = render(<Form />);
      fireEvent.change(screen.getByLabelText("customer"), { target: { value: "private" } });
      first.unmount();
      render(<Form scope={scope} />);
      expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("");
      expect(JSON.stringify(sessionStorage)).not.toContain("private");
    });
  it("keeps retries idempotent after unmount and clears/remounts only on success", async () => {
    const keys: string[] = [];
    const action = vi.fn(async (form: FormData) => {
      keys.push(String(form.get("idempotency_key")));
      if (keys.length === 1) return { error: "Saxlanmadı" };
    });
    const first = render(<Form action={action} />);
    fireEvent.change(screen.getByLabelText("customer"), { target: { value: "keep" } });
    fireEvent.submit(screen.getByText("Save").closest("form")!);
    await screen.findByRole("alert");
    first.unmount();
    render(<Form action={action} />);
    expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("keep");
    fireEvent.submit(screen.getByText("Save").closest("form")!);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(keys[0]).toBe(keys[1]);
    expect(sessionStorage.length).toBe(0);
    expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("");
    fireEvent.submit(screen.getByText("Save").closest("form")!);
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[1]);
  });
  it("excludes passwords, ignores damaged storage and never submits on restore", () => {
    const action = vi.fn(async () => {});
    const first = render(<Form action={action} />);
    fireEvent.change(screen.getByLabelText("password"), { target: { value: "never-store" } });
    expect(JSON.stringify(sessionStorage)).not.toContain("never-store");
    const key = sessionStorage.key(0)!;
    sessionStorage.setItem(key, "{broken");
    first.unmount();
    render(<Form action={action} />);
    expect(action).not.toHaveBeenCalled();
    expect((screen.getByLabelText("password") as HTMLInputElement).value).toBe("");
  });
  it("keeps purchase cost, payment mode, dates and notes without submitting on restoration", () => {
    const ui = <DraftSession scope="purchase-session"><PurchaseEntry jobId="job" suppliers={[]} workers={[]} /></DraftSession>;
    const first = render(ui);
    fireEvent.change(screen.getByLabelText("Faktiki maya, cəmi (AZN)"), { target: { value: "100,50" } });
    fireEvent.change(screen.getByLabelText("Ödəniş"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("Cəmi ödənilmiş məbləğ (ƏDV daxil, AZN)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Qeyd"), { target: { value: "Alış qaralaması" } });
    first.unmount();
    render(ui);
    expect((screen.getByLabelText("Faktiki maya, cəmi (AZN)") as HTMLInputElement).value).toBe("100,50");
    expect((screen.getByLabelText("Ödəniş") as HTMLSelectElement).value).toBe("PARTIAL");
    expect((screen.getByLabelText("Cəmi ödənilmiş məbləğ (ƏDV daxil, AZN)") as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText("Qeyd") as HTMLInputElement).value).toBe("Alış qaralaması");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("restores actual quote rows and a percentage discount with the same serialized values", () => {
    const ui = <DraftSession scope="quotes"><ActionForm draftKey="new" action={async () => {}}>
      <IntakeQuotes work={[]} parts={[]} units={[]} />
    </ActionForm></DraftSession>;
    const first = render(ui);
    const add = screen.getAllByRole("button").find((button) => button.textContent?.includes("İş əlavə"))!;
    expect(add).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.click(add);
    for (const input of screen.getAllByLabelText("Vahid qiyməti (AZN)")) fireEvent.change(input, { target: { value: "250" } });
    fireEvent.click(screen.getByLabelText("Endirim tətbiq et"));
    fireEvent.change(screen.getByLabelText("Endirim dəyəri"), { target: { value: "10" } });
    const raw = (document.querySelector('[name="work_lines"]') as HTMLInputElement).value;
    first.unmount();
    render(ui);
    expect(screen.getAllByLabelText("Vahid qiyməti (AZN)")).toHaveLength(4);
    expect((document.querySelector('[name="work_lines"]') as HTMLInputElement).value).toBe(raw);
    expect((screen.getByLabelText("Endirim dəyəri") as HTMLInputElement).value).toBe("10");
    expect(screen.getAllByText("900,00 ₼").length).toBeGreaterThan(0);
  });
  it("clears memory and storage when another tab logs out", () => {
    const channels: { onmessage?: () => void }[] = [];
    vi.stubGlobal("BroadcastChannel", class {
      onmessage?: () => void;
      constructor() { channels.push(this); }
      close() {}
      postMessage() {}
    });
    render(<Form />);
    fireEvent.change(screen.getByLabelText("customer"), { target: { value: "private" } });
    act(() => channels[0].onmessage?.());
    expect(sessionStorage.length).toBe(0);
    expect(screen.queryByLabelText("customer")).toBeNull();
  });
  it("allows only one in-flight request and does not reuse a discarded draft", async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Form action={action} />);
    const form = screen.getByText("Save").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Qaralamanı ləğv et" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect(sessionStorage.length).toBe(0);
  });
});
