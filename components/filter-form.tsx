"use client";
export function FilterForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      className="filter-grid mb-5 border-y border-[var(--border)] py-4"
      onClick={(event) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest("[data-filter-reset]")
        )
          return;
        for (const element of Array.from(event.currentTarget.elements)) {
          if (
            element instanceof HTMLInputElement &&
            (element.type !== "hidden" ||
              element.hasAttribute("data-date-value"))
          ) {
            element.value = "";
            element.setCustomValidity("");
          }
          if (element instanceof HTMLSelectElement) element.value = "";
        }
      }}
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement &&
          target.name === "period" &&
          !target.value
        ) {
          for (const name of ["from", "to", "from_display", "to_display"]) {
            const input = event.currentTarget.elements.namedItem(name);
            if (input instanceof HTMLInputElement) {
              input.value = "";
              input.setCustomValidity("");
            }
          }
        }
        if (
          target instanceof HTMLInputElement &&
          ["from", "to"].includes(target.dataset.dateField || target.name)
        ) {
          const period = event.currentTarget.elements.namedItem("period");
          if (period instanceof HTMLSelectElement) period.value = "custom";
        }
      }}
    >
      {children}
    </form>
  );
}
