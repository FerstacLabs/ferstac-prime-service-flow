import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidebarNav } from "@/components/sidebar-nav";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { QuoteEditor } from "@/components/quote-editor";
import { PrintReport } from "@/components/reports/print-report";
import type { PrimeReport } from "@/lib/reports/report-types";

const state = vi.hoisted(() => ({ pathname: "/vehicles", pending: false }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: state.pending }),
}));
vi.mock("@/app/actions/finance", () => ({ createCatalogAction: vi.fn() }));
vi.mock("@/components/reports/print-trigger", () => ({
  PrintTrigger: () => null,
  PrintButton: () => <button>Print</button>,
}));
afterEach(() => {
  cleanup();
  state.pending = false;
  vi.restoreAllMocks();
});

describe("shared UI states", () => {
  it.each([
    ["/vehicles/new", "Avtomobillər"],
    ["/workers/worker-id", "İşçilər"],
    ["/work", "Görüləcək işlər"],
    ["/purchases/suppliers/supplier-id", "Satınalma"],
    ["/kassa", "Kassa"],
  ])("marks only the matching sidebar route for %s", (pathname, label) => {
    state.pathname = pathname;
    const { container } = render(<SidebarNav role="ADMIN" />);
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: label }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps both button states mounted but exposes only the active label", () => {
    const { rerender, container } = render(<SubmitButton>Saxla</SubmitButton>);
    expect(
      screen.getByRole("button", { name: "Saxla" }).getAttribute("aria-busy"),
    ).toBe("false");
    const states = container.querySelector(".button-state")!.children;
    expect(states).toHaveLength(2);
    expect(states[1].getAttribute("aria-hidden")).toBe("true");
    state.pending = true;
    rerender(<SubmitButton>Saxla</SubmitButton>);
    const pending = screen.getByRole("button", {
      name: "Saxlanır...",
    }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(states[0].getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".burnout-loader")).not.toBeNull();
  });

  it("labels icon-only destructive controls and retains confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ConfirmButton message="Confirm delete" />);
    const button = screen.getByRole("button", { name: "Sil" });
    expect(button.classList.contains("btn-icon")).toBe(true);
    expect(fireEvent.click(button)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Confirm delete");
  });
});

describe("quote row interaction", () => {
  it("preserves selected IDs, prices and 250-character notes through adding/removing rows", () => {
    const { container } = render(
      <QuoteEditor
        kind="work"
        options={[{ id: "work-one", name: "Diaqnostika" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "İş əlavə et" }));
    const select = screen.getByRole("combobox", { name: "İş / xidmət" });
    fireEvent.focus(select);
    fireEvent.keyDown(select, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Müştəriyə deyilən qiymət"), {
      target: { value: "123.45" },
    });
    const note = screen.getByLabelText(/Qeyd/) as HTMLTextAreaElement;
    expect(note.tagName).toBe("TEXTAREA");
    expect(note.maxLength).toBe(250);
    fireEvent.change(note, { target: { value: "A".repeat(250) } });
    expect(screen.getByText("250/250")).not.toBeNull();
    const payload = () =>
      JSON.parse(
        (container.querySelector('[name="work_lines"]') as HTMLInputElement)
          .value,
      );
    expect(payload()).toEqual([
      { catalogId: "work-one", quotedPrice: "123.45", note: "A".repeat(250) },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "İş əlavə et" }));
    expect(payload()).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Sətri sil" })[1]);
    expect(payload()[0].quotedPrice).toBe("123.45");
    fireEvent.click(screen.getByRole("button", { name: "Sətri sil" }));
    expect(payload()).toEqual([]);
  });
});

describe("print presentation", () => {
  it("scopes audit print pagination without application navigation", () => {
    const { container } = render(
      <PrintReport
        report={{
          scope: "audit",
          title: "Audit jurnalı",
          generatedAt: "22.09.2026",
          orientation: "landscape",
          filters: "Dövr: 01.09.2026 - 22.09.2026",
          summary: [],
          sections: [],
        }}
      />,
    );
    expect(
      container.querySelector("main.print-audit.print-landscape"),
    ).not.toBeNull();
    expect(screen.getByAltText("PRIME")).not.toBeNull();
    expect(screen.getByText("Dövr: 01.09.2026 - 22.09.2026")).not.toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });

  it("keeps report values and long details intact in full-width companion rows", () => {
    const report: PrimeReport = {
      scope: "kassa",
      title: "Kassa",
      generatedAt: "2026-09-19",
      orientation: "landscape",
      summary: [{ label: "Avans", value: "200,00 AZN" }],
      sections: [
        {
          title: "Tarixçə",
          table: {
            columns: [
              { key: "work", label: "İş" },
              { key: "amount", label: "Məbləğ" },
            ],
            rows: [
              {
                id: "row-one",
                cells: { work: "Diaqnostika", amount: "500,00 AZN" },
                details: [{ label: "Qeyd", value: "A".repeat(250) }],
              },
            ],
          },
        },
      ],
    };
    const { container } = render(<PrintReport report={report} />);
    expect(
      container.querySelector("main")!.classList.contains("print-landscape"),
    ).toBe(true);
    expect(screen.getByRole("region", { name: "Tarixçə" }).tabIndex).toBe(0);
    expect(screen.getByText("500,00 AZN")).not.toBeNull();
    expect(screen.getByText("200,00 AZN")).not.toBeNull();
    const detail = container.querySelector(".print-details-row td")!;
    expect(detail.getAttribute("colspan")).toBe("2");
    expect(detail.textContent).toContain("A".repeat(250));
    expect(container.querySelector(".print-primary-cell")!.textContent).toBe(
      "Diaqnostika",
    );
  });
});
