import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntakeDateInput } from "@/components/intake-date-input";
import { FilterForm } from "@/components/filter-form";
import { parseFilters } from "@/lib/filters";
import {
  formatReportDate,
  formatReportDateTime,
} from "@/lib/reports/report-format";

afterEach(cleanup);

describe("day-first date submission", () => {
  it.each(["07/10/2026", "07-10-2026", "2026-10-07"])(
    "submits ISO for %s even before blur",
    (value) => {
      const { container } = render(
        <form>
          <label>
            Date
            <IntakeDateInput name="date" />
          </label>
        </form>,
      );
      const input = screen.getByRole("textbox", { name: "Date" });
      fireEvent.change(input, { target: { value } });
      expect(new FormData(container.querySelector("form")!).get("date")).toBe(
        "2026-10-07",
      );
      fireEvent.blur(input);
      expect((input as HTMLInputElement).value).toBe("07/10/2026");
    },
  );

  it("rejects impossible dates, clears stale ISO, and resets native validation", () => {
    const { container } = render(
      <form>
        <label>
          Date
          <IntakeDateInput name="date" defaultValue="2026-10-07" required />
        </label>
      </form>,
    );
    const input = screen.getByRole("textbox", {
      name: "Date",
    }) as HTMLInputElement;
    const form = container.querySelector("form")!;
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    expect(input.checkValidity()).toBe(false);
    expect(new FormData(form).get("date")).toBe("");
    form.reset();
    expect(input.checkValidity()).toBe(true);
    expect(input.value).toBe("07/10/2026");
    expect(new FormData(form).get("date")).toBe("2026-10-07");
  });

  it("clears visible and submitted dates when filters reset", () => {
    const { container } = render(
      <FilterForm>
        <select name="period" aria-label="Period" defaultValue="month">
          <option value="">All</option>
          <option value="month">Month</option>
          <option value="custom">Custom</option>
        </select>
        <label>
          From
          <IntakeDateInput name="from" defaultValue="2026-10-01" />
        </label>
        <label>
          To
          <IntakeDateInput name="to" defaultValue="2026-10-07" />
        </label>
        <button type="button" data-filter-reset>
          Reset
        </button>
      </FilterForm>,
    );
    const form = container.querySelector("form")!;
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "07/10/2026" },
    });
    expect((screen.getByLabelText("Period") as HTMLSelectElement).value).toBe(
      "custom",
    );
    fireEvent.change(screen.getByLabelText("Period"), {
      target: { value: "" },
    });
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("");
    expect(new FormData(form).get("from")).toBe("");
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get("to")).toBe("");
  });

  it("normalizes date filters and displays Baku timestamps without shifting date-only values", () => {
    expect(
      parseFilters({ from: "07/10/2026", to: "31/02/2026" }),
    ).toMatchObject({ from: "2026-10-07", to: "" });
    expect(formatReportDate("2026-10-07")).toBe("07/10/2026");
    expect(formatReportDateTime("2026-10-06T22:30:00Z")).toBe(
      "07/10/2026 02:30",
    );
  });
});
