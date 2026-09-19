"use client";
export function FilterForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      className="mb-5 grid items-end gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2 xl:grid-cols-4"
      onChange={(event) => {
        const target = event.target;
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
