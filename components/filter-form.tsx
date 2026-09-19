"use client";
export function FilterForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      className="filter-grid mb-5 border-y border-[var(--border)] py-4"
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLSelectElement &&
          target.name === "period" &&
          !target.value
        ) {
          for (const name of ["from", "to"]) {
            const input = event.currentTarget.elements.namedItem(name);
            if (input instanceof HTMLInputElement) input.value = "";
          }
        }
        if (
          target instanceof HTMLInputElement &&
          (target.name === "from" || target.name === "to")
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
