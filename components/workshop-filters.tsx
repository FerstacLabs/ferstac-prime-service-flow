import Link from "next/link";
import { FilterForm } from "@/components/filter-form";
import { Filter, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { PlateSearch } from "@/components/plate-search";
import { filterQuery, type WorkshopFilters } from "@/lib/filters";
import {
  reportFundingLabels,
  reportJobStatusLabels,
  reportWorkStatusLabels,
  reportPaymentLabels,
} from "@/lib/reports/report-format";
import { allocationLabels } from "@/lib/workshop";
type Props = {
  filters: WorkshopFilters;
  scope:
    "vehicles" | "work" | "purchases" | "workers" | "kassa" | "worker-cash";
  jobs?: SelectOption[];
  workers?: SelectOption[];
  works?: SelectOption[];
  suppliers?: SelectOption[];
  fixed?: Record<string, string>;
};
export function WorkshopFilters({
  filters: f,
  scope,
  jobs,
  workers,
  works,
  suppliers,
  fixed = {},
}: Props) {
  const select = (
    name: keyof WorkshopFilters,
    label: string,
    values: Record<string, string>,
  ) => (
    <label className="text-xs text-[var(--muted)]">
      {label}
      <select className="field mt-1" name={name} defaultValue={String(f[name])}>
        <option value="">Hamısı</option>
        {Object.entries(values).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <FilterForm>
      {Object.entries(fixed).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {scope !== "workers" && scope !== "worker-cash" ? (
        <PlateSearch defaultValue={f.plate} />
      ) : null}
      {scope === "vehicles" ? (
        <>
          <label className="text-xs text-[var(--muted)]">
            Görünüş
            <select
              name="visibility"
              defaultValue={f.visibility}
              className="field mt-1"
            >
              <option value="active">Aktiv</option>
              <option value="archived">Arxiv</option>
              <option value="all">Hamısı</option>
            </select>
          </label>
          {select("status", "Status", reportJobStatusLabels)}
          {select("source", "Mənbə", reportFundingLabels)}
          {select("sort", "Sıralama", {
            newest: "Ən yenilər",
            oldest: "Ən köhnələr",
            plate: "Nömrə",
          })}
        </>
      ) : null}
      {jobs && !fixed.job ? (
        <SearchSelect
          key={`job-${f.job}`}
          name="job"
          label="Avtomobil"
          options={jobs}
          defaultValue={f.job}
        />
      ) : null}
      {workers && !fixed.worker ? (
        <SearchSelect
          key={`worker-${f.worker}`}
          name="worker"
          label="Usta"
          options={workers}
          defaultValue={f.worker}
        />
      ) : null}
      {works ? (
        <SearchSelect
          key={`work-${f.work}`}
          name="work"
          label="İş / kateqoriya"
          options={works}
          defaultValue={f.work}
        />
      ) : null}
      {scope === "work"
        ? select("status", "İş statusu", reportWorkStatusLabels)
        : null}
      {suppliers && !fixed.supplier ? (
        <SearchSelect
          key={`supplier-${f.supplier}`}
          name="supplier"
          label="Təchizatçı"
          options={suppliers}
          defaultValue={f.supplier}
        />
      ) : null}
      {scope === "purchases"
        ? select("payment", "Ödəniş", reportPaymentLabels)
        : null}
      {scope !== "vehicles" ? (
        <>
          {select("period", "Dövr", {
            today: "Bu gün",
            week: "Bu həftə",
            month: "Bu ay",
            year: "Bu il",
            custom: "Xüsusi tarix",
          })}
          <label className="text-xs text-[var(--muted)]">
            Başlanğıc
            <input
              name="from"
              type="date"
              defaultValue={f.from}
              className="field mt-1"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Son
            <input
              name="to"
              type="date"
              defaultValue={f.to}
              className="field mt-1"
            />
          </label>
        </>
      ) : null}
      {scope === "kassa" ? (
        <>
          {select("direction", "İstiqamət", { IN: "Mədaxil", OUT: "Məxaric" })}
          {select("type", "Əməliyyat", allocationLabels)}
          {select("balance", "Qalıqlar", {
            outstanding: "Yalnız borclar",
            closed: "Bağlanmış",
            customer: "Müştəri borcları",
            supplier: "Təchizatçı borcları",
            worker: "Usta borcları",
          })}
        </>
      ) : null}
      {scope === "worker-cash"
        ? select("balance", "Ödəniş vəziyyəti", {
            outstanding: "Qazanılmış borcu olanlar",
            advance: "Avansı olanlar",
            paid: "Tam ödənilənlər",
          })
        : null}
      <div className="flex gap-2">
        <button className="btn btn-primary">
          <Filter size={16} />
          Tətbiq et
        </button>
        <Link
          href={`?${new URLSearchParams(fixed)}`}
          className="btn btn-secondary btn-icon"
          title="Filtrləri sıfırla"
          aria-label="Filtrləri sıfırla"
        >
          <RotateCcw size={16} />
        </Link>
      </div>
    </FilterForm>
  );
}
export const PAGE_SIZE = 24;
export function Pagination({
  filters,
  total,
}: {
  filters: WorkshopFilters;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <nav
      aria-label="Səhifələr"
      className="my-5 flex flex-wrap items-center justify-end gap-3 text-sm text-[var(--muted)]"
    >
      <span>
        {total} nəticə · {filters.page} / {pages}
      </span>
      {filters.page > 1 ? (
        <Link
          className="btn btn-secondary"
          title="Əvvəlki"
          aria-label="Əvvəlki səhifə"
          href={`?${filterQuery(filters)}&page=${filters.page - 1}`}
        >
          <ChevronLeft size={16} />
        </Link>
      ) : null}
      {filters.page < pages ? (
        <Link
          className="btn btn-secondary"
          title="Növbəti"
          aria-label="Növbəti səhifə"
          href={`?${filterQuery(filters)}&page=${filters.page + 1}`}
        >
          <ChevronRight size={16} />
        </Link>
      ) : null}
    </nav>
  );
}
export function pageRows<T>(rows: T[], filters: WorkshopFilters) {
  return rows.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
}
