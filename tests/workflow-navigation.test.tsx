import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DraftSession } from "@/components/form-draft";
import { WorkflowNavigation } from "@/components/workflow-navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { ActionForm } from "@/components/action-form";
import { workflowLocation } from "@/lib/workflow-location";
const route = vi.hoisted(() => ({ pathname: "/vehicles/new", search: "", refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ refresh: route.refresh }),
}));
const save = vi.fn(async () => {});
function App({ scope = "org:admin:ADMIN:session", vehicleAction = save }: {
  scope?: string; vehicleAction?: (form: FormData) => Promise<void | { error: string }>;
}) {
  return <DraftSession scope={scope}><WorkflowNavigation role="ADMIN"><SidebarNav role="ADMIN" />
    <form data-draft-logout onSubmit={(event) => event.preventDefault()}><button>Logout</button></form>
    <main className="app-content">
      {route.pathname === "/vehicles/new" && <ActionForm draftKey="vehicle:new" action={vehicleAction}>
        <input name="customer_name" aria-label="customer" /><button>Save vehicle</button>
      </ActionForm>}
      {route.pathname === "/purchases" && <ActionForm draftKey="purchase:job:new" action={save}>
        <input name="unit_price" aria-label="cost" /><button>Save purchase</button>
      </ActionForm>}
      {route.pathname === "/kassa" && <ActionForm draftKey="movement:test" action={save}>
        <input name="amount" aria-label="amount" /><button>Save movement</button>
      </ActionForm>}
    </main>
  </WorkflowNavigation></DraftSession>;
}
beforeEach(() => { sessionStorage.clear(); route.pathname = "/vehicles/new"; route.search = ""; vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it("restores the vehicle form, purchase query/context and values across module changes and refresh", async () => {
  const app = render(<App />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Draft user" } });
  route.pathname = "/purchases"; route.search = "purchaseJob=11111111-1111-4111-a111-111111111111&tab=parts";
  app.rerender(<App />);
  fireEvent.change(screen.getByLabelText("cost"), { target: { value: "100.50" } });
  route.pathname = "/kassa"; route.search = "view=reports&reportType=vat"; app.rerender(<App />);
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles/new");
  expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toContain("purchaseJob=");
  expect(screen.getByRole("link", { name: "Avtomobillər: əsas siyahı" }).getAttribute("href")).toBe("/vehicles");
  route.pathname = "/vehicles/new"; route.search = ""; app.rerender(<App />);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("Draft user");
  app.unmount(); const refreshed = render(<App />);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("Draft user");
  expect(screen.getByRole("link", { name: "Kassa" }).getAttribute("href")).toBe("/kassa?view=reports&reportType=vat");
  route.pathname = "/purchases"; route.search = "purchaseJob=11111111-1111-4111-a111-111111111111&tab=parts";
  refreshed.rerender(<App />);
  expect((screen.getByLabelText("cost") as HTMLInputElement).value).toBe("100.50");
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save purchase" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toBe("/purchases");
});
it("clears only the discarded workflow, allows fresh editing, and isolates another account", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const app = render(<App />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Private" } });
  fireEvent.click(screen.getByRole("button", { name: "Qaralamanı ləğv et" }));
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles");
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "New draft" } });
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles/new");
  app.rerender(<App scope="org:other:ADMIN:session" />);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("");
  expect(JSON.stringify(sessionStorage)).not.toContain("New draft");
});
it("does not persist external locations, authentication parameters or unknown query fields", () => {
  expect(workflowLocation("//evil.test/vehicles")).toBeNull();
  expect(workflowLocation("/login?token=secret")).toBeNull();
  expect(workflowLocation("/vehicles/11111111-1111-4111-a111-111111111111/edit?password=secret&tab=work"))
    .toEqual({ module: "/vehicles", href: "/vehicles/11111111-1111-4111-a111-111111111111/edit?tab=work" });
});
it("expires stale module locations and clears navigation and drafts on logout", () => {
  sessionStorage.setItem("prime:draft:v1:org:admin:ADMIN:session:navigation", JSON.stringify({
    "/purchases": { href: "/purchases?purchaseJob=old", updated: Date.now() - 9 * 3600000, scroll: 0, details: [] },
  }));
  render(<App />);
  expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toBe("/purchases");
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Private" } });
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
  expect(sessionStorage.length).toBe(0);
  expect(screen.queryByLabelText("customer")).toBeNull();
});
it("expires remembered workflows during a long-running browser session", () => {
  vi.useFakeTimers();
  try {
    sessionStorage.setItem("prime:draft:v1:org:admin:ADMIN:session:navigation", JSON.stringify({
      "/purchases": { href: "/purchases?purchaseJob=old", updated: Date.now(), scroll: 0, details: [] },
    }));
    render(<App />);
    expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toContain("purchaseJob");
    act(() => vi.advanceTimersByTime(9 * 3600000));
    expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toBe("/purchases");
  } finally { vi.useRealTimers(); }
});
it("a late save clears its source workflow, not the newly active module or another session", () => {
  const app = render(<App />);
  route.pathname = "/purchases"; route.search = "purchaseJob=active"; app.rerender(<App />);
  act(() => window.dispatchEvent(new CustomEvent("prime:draft-completed", { detail: { href: "/vehicles/new", scope: "org:admin:ADMIN:session" } })));
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles");
  expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toBe("/purchases?purchaseJob=active");
  act(() => window.dispatchEvent(new CustomEvent("prime:draft-completed", { detail: { href: "/purchases?purchaseJob=active", scope: "org:other:ADMIN:session" } })));
  expect(screen.getByRole("link", { name: "Satınalma" }).getAttribute("href")).toBe("/purchases?purchaseJob=active");
});

const scopePrefix = "prime:draft:v1:org:admin:ADMIN:session:";
function pendingSave() {
  let resolve!: (result: void | { error: string }) => void;
  let reject!: (error: Error) => void;
  const action = vi.fn(() => new Promise<void | { error: string }>((done, fail) => { resolve = done; reject = fail; }));
  return { action, finish: (result?: { error: string }) => resolve(result), fail: () => reject(new Error("Offline")) };
}
it("finishes an actual vehicle save after navigating to Kassa without losing its draft or restored route", async () => {
  const pending = pendingSave();
  const app = render(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Saving customer" } });
  fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
  await waitFor(() => expect(pending.action).toHaveBeenCalledTimes(1));
  route.pathname = "/kassa"; route.search = "view=journal&channel=CASH";
  app.rerender(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("amount"), { target: { value: "59.00" } });
  const cashDraft = sessionStorage.getItem(`${scopePrefix}movement:test`);
  const cashPosition = JSON.parse(sessionStorage.getItem(`${scopePrefix}navigation`)!)["/kassa"];

  await act(async () => pending.finish());

  expect(sessionStorage.getItem(`${scopePrefix}vehicle:new`)).toBeNull();
  expect(sessionStorage.getItem(`${scopePrefix}movement:test`)).toBe(cashDraft);
  expect(JSON.parse(sessionStorage.getItem(`${scopePrefix}navigation`)!)["/kassa"]).toEqual(cashPosition);
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("59.00");
  expect(route.pathname).toBe("/kassa");
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles");
  expect(route.refresh).toHaveBeenCalledTimes(1);
  route.pathname = "/vehicles"; route.search = ""; app.rerender(<App />);
  expect(screen.getByRole("link", { name: "Kassa" }).getAttribute("href")).toBe("/kassa?view=journal&channel=CASH");
  route.pathname = "/kassa"; route.search = "view=journal&channel=CASH"; app.rerender(<App />);
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("59.00");
  app.unmount(); render(<App />);
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("59.00");
  expect(pending.action).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});
it.each(["returned error", "rejected request"])("retains both drafts when the late vehicle save fails: %s", async (failure) => {
  const pending = pendingSave();
  const app = render(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Retry customer" } });
  fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
  await waitFor(() => expect(pending.action).toHaveBeenCalledTimes(1));
  const vehicleDraft = sessionStorage.getItem(`${scopePrefix}vehicle:new`);
  route.pathname = "/kassa"; route.search = "view=journal&channel=BANK";
  app.rerender(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("amount"), { target: { value: "118.00" } });
  const cashDraft = sessionStorage.getItem(`${scopePrefix}movement:test`);
  const positions = sessionStorage.getItem(`${scopePrefix}navigation`);

  await act(async () => failure === "returned error" ? pending.finish({ error: "Saxlanmadı" }) : pending.fail());

  expect(sessionStorage.getItem(`${scopePrefix}vehicle:new`)).toBe(vehicleDraft);
  expect(sessionStorage.getItem(`${scopePrefix}movement:test`)).toBe(cashDraft);
  expect(sessionStorage.getItem(`${scopePrefix}navigation`)).toBe(positions);
  expect(route.pathname).toBe("/kassa");
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("118.00");
  expect(route.refresh).not.toHaveBeenCalled();
  route.pathname = "/vehicles/new"; route.search = ""; app.rerender(<App />);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("Retry customer");
  expect(screen.getByRole("link", { name: "Kassa" }).getAttribute("href")).toBe("/kassa?view=journal&channel=BANK");
  expect(pending.action).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});
it("discards only the active workflow while another module save is pending", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const pending = pendingSave();
  const app = render(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Keep until saved" } });
  fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
  await waitFor(() => expect(pending.action).toHaveBeenCalledTimes(1));
  const vehicleDraft = sessionStorage.getItem(`${scopePrefix}vehicle:new`);
  route.pathname = "/kassa"; route.search = "view=journal"; app.rerender(<App />);
  fireEvent.change(screen.getByLabelText("amount"), { target: { value: "59" } });
  fireEvent.click(screen.getByRole("button", { name: "Qaralamanı ləğv et" }));
  expect(sessionStorage.getItem(`${scopePrefix}movement:test`)).toBeNull();
  expect(sessionStorage.getItem(`${scopePrefix}vehicle:new`)).toBe(vehicleDraft);
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles/new");
  expect(screen.getByRole("link", { name: "Kassa" }).getAttribute("href")).toBe("/kassa");
  await act(async () => pending.finish());
  expect(sessionStorage.getItem(`${scopePrefix}vehicle:new`)).toBeNull();
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("");
  expect(save).not.toHaveBeenCalled();
});
it.each(["org:other:ADMIN:session", "other:admin:ADMIN:session"])("ignores a late save from the previous identity after switching to %s", async (scope) => {
  const pending = pendingSave();
  const app = render(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Old identity" } });
  fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
  await waitFor(() => expect(pending.action).toHaveBeenCalledTimes(1));
  app.rerender(<App scope={scope} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "New identity" } });
  const storage = JSON.stringify(sessionStorage);

  await act(async () => pending.finish());

  expect(JSON.stringify(sessionStorage)).toBe(storage);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("New identity");
  expect(screen.getByRole("link", { name: "Avtomobillər" }).getAttribute("href")).toBe("/vehicles/new");
  expect(save).not.toHaveBeenCalled();
});
it("does not clear a replacement draft or route when a discarded workflow's old save finishes", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const pending = pendingSave();
  const app = render(<App vehicleAction={pending.action} />);
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Old vehicle" } });
  fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));
  await waitFor(() => expect(pending.action).toHaveBeenCalledTimes(1));
  route.pathname = "/kassa"; app.rerender(<App />);
  fireEvent.change(screen.getByLabelText("amount"), { target: { value: "59" } });
  route.pathname = "/vehicles/new"; app.rerender(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Qaralamanı ləğv et" }));
  fireEvent.change(screen.getByLabelText("customer"), { target: { value: "Replacement vehicle" } });
  route.pathname = "/kassa"; app.rerender(<App />);
  const replacementDraft = sessionStorage.getItem(`${scopePrefix}vehicle:new`);
  const positions = sessionStorage.getItem(`${scopePrefix}navigation`);

  await act(async () => pending.finish());

  expect(sessionStorage.getItem(`${scopePrefix}vehicle:new`)).toBe(replacementDraft);
  expect(sessionStorage.getItem(`${scopePrefix}navigation`)).toBe(positions);
  expect((screen.getByLabelText("amount") as HTMLInputElement).value).toBe("59");
  route.pathname = "/vehicles/new"; app.rerender(<App />);
  expect((screen.getByLabelText("customer") as HTMLInputElement).value).toBe("Replacement vehicle");
  expect(save).not.toHaveBeenCalled();
});
