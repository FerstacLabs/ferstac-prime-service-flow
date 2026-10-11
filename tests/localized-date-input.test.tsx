import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("inserts slashes progressively, rejects letters, and limits digits", () => {
    const { container } = render(
      <form>
        <IntakeDateInput name="date" />
      </form>,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    const expected = [
      "1",
      "11/",
      "11/1",
      "11/10/",
      "11/10/2",
      "11/10/20",
      "11/10/202",
      "11/10/2026",
    ];
    [..."11102026"].forEach((digit, i) => {
      fireEvent.change(input, { target: { value: input.value + digit } });
      expect(input.value).toBe(expected[i]);
    });
    fireEvent.change(input, { target: { value: input.value + "a" } });
    expect(input.value).toBe("11/10/2026");
    fireEvent.change(input, { target: { value: "111020261234" } });
    expect(input.value).toBe("11/10/2026");
    expect(new FormData(container.querySelector("form")!).get("date")).toBe(
      "2026-10-11",
    );
    expect(input.maxLength).toBe(10);
  });
  it.each(["11/10/2026", "11-10-2026", "11.10.2026", " 2026-10-11 "])(
    "normalizes pasted %s",
    (value) => {
      const { container } = render(
        <form>
          <IntakeDateInput name="date" />
        </form>,
      );
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.paste(input, { clipboardData: { getData: () => value } });
      expect(input.value).toBe("11/10/2026");
      expect(new FormData(container.querySelector("form")!).get("date")).toBe(
        "2026-10-11",
      );
    },
  );
  it.each(["31/02/2026", "00/10/2026", "11/13/2026", "99/99/9999"])(
    "blocks impossible pasted %s",
    (value) => {
      const { container } = render(
        <form>
          <IntakeDateInput name="date" defaultValue="2026-10-11" />
        </form>,
      );
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.paste(input, { clipboardData: { getData: () => value } });
      expect(input.checkValidity()).toBe(false);
      expect(new FormData(container.querySelector("form")!).get("date")).toBe(
        "",
      );
    },
  );
  it("opens calendar and submits the selected ISO date without a timezone conversion", () => {
    const { container } = render(
      <form>
        <IntakeDateInput name="date" />
      </form>,
    );
    const picker =
      container.querySelector<HTMLInputElement>('input[type="date"]')!;
    const open = vi.fn();
    picker.showPicker = open;
    fireEvent.click(screen.getByRole("button", { name: "Təqvimi aç" }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.change(picker, { target: { value: "2026-10-11" } });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "11/10/2026",
    );
    expect(new FormData(container.querySelector("form")!).get("date")).toBe(
      "2026-10-11",
    );
  });
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
    fireEvent.change(screen.getByLabelText("Period"), {
      target: { value: "month" },
    });
    fireEvent.paste(screen.getByLabelText("From"), {
      clipboardData: { getData: () => "11.10.2026" },
    });
    expect((screen.getByLabelText("Period") as HTMLSelectElement).value).toBe(
      "custom",
    );
    fireEvent.change(screen.getByLabelText("Period"), {
      target: { value: "month" },
    });
    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: "2026-10-11" },
    });
    expect((screen.getByLabelText("Period") as HTMLSelectElement).value).toBe(
      "custom",
    );
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
