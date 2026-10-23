const modules = ["vehicles", "purchases", "kassa", "suppliers", "workers", "work", "overview", "audit", "security"];
const queryKeys = new Set(["q", "role", "detail", "plate", "status", "source", "sort", "job", "worker", "work", "supplier", "payment", "from", "to", "direction", "type", "balance", "page", "period", "visibility", "view", "tab", "purchaseJob", "costingJob", "settlementJob", "account", "channel", "category", "reportType", "search", "mode"]);
// Persist local module routes only, never arbitrary URLs or authentication parameters.
export function workflowLocation(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.length > 4096) return null;
  const url = new URL(href, "https://local.invalid");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!modules.includes(parts[0]) || !/^\/[a-zA-Z0-9/-]+$/.test(url.pathname)) return null;
  const query = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (queryKeys.has(key) && value.length <= 250) query.set(key, value);
  });
  return { module: `/${parts[0]}`, href: url.pathname + (query.size ? `?${query}` : "") };
}
