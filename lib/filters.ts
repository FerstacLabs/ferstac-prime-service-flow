import { normalizeAzPlate } from "@/lib/plate";
export type SearchParams = Record<string, string | string[] | undefined>;
export type WorkshopFilters = {
  plate: string;
  status: string;
  source: string;
  sort: string;
  job: string;
  worker: string;
  work: string;
  supplier: string;
  payment: string;
  from: string;
  to: string;
  direction: string;
  type: string;
  balance: string;
  page: number;
  period: string;
};
export function bakuDate(value: Date | string = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function parseFilters(params: SearchParams): WorkshopFilters {
  const get = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const date = (key: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(get(key)) ? get(key) : "";
  let from = date("from"),
    to = date("to");
  const period = get("period"),
    today = bakuDate();
  if (period && period !== "custom") {
    to = today;
    if (period === "today") from = today;
    if (period === "month") from = `${today.slice(0, 7)}-01`;
    if (period === "year") from = `${today.slice(0, 4)}-01-01`;
    if (period === "week") {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      from = d.toISOString().slice(0, 10);
    }
  }
  return {
    plate: normalizeAzPlate(get("plate")),
    status: get("status"),
    source: get("source"),
    sort: get("sort") || "newest",
    job: get("job"),
    worker: get("worker"),
    work: get("work"),
    supplier: get("supplier"),
    payment: get("payment"),
    from,
    to,
    direction: get("direction"),
    type: get("type"),
    balance: get("balance"),
    page: Math.max(1, Math.min(100000, Number.parseInt(get("page")) || 1)),
    period,
  };
}
export const inPeriod = (date: string | null | undefined, f: WorkshopFilters) =>
  (!f.from && !f.to) ||
  (!!date &&
    (!f.from || bakuDate(date) >= f.from) &&
    (!f.to || bakuDate(date) <= f.to));
export function filterQuery(
  f: WorkshopFilters,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams();
  Object.entries({ ...f, ...extra }).forEach(([k, v]) => {
    if (v && k !== "page") params.set(k, String(v));
  });
  return params.toString();
}
