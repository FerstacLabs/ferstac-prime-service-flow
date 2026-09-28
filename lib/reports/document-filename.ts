import type { PrimeReport } from "@/lib/reports/report-types";

const letters: Record<string, string> = {
  ə: "e",
  Ə: "E",
  ı: "i",
  İ: "I",
  ş: "s",
  Ş: "S",
  ç: "c",
  Ç: "C",
  ğ: "g",
  Ğ: "G",
  ö: "o",
  Ö: "O",
  ü: "u",
  Ü: "U",
};
const uuid = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;
export function filenamePart(value: string) {
  return value
    .replace(uuid, "")
    .replace(/[əƏıİşŞçÇğĞöÖüÜ]/g, (c) => letters[c])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Uses resolved report labels, never raw URL identifiers; Baku is the business timezone. */
export function documentFilename(
  report: PrimeReport,
  now = new Date(),
  nonce = crypto.randomUUID().slice(0, 8),
) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [day, time] = date.split(" ");
  const suffix = `_${day}_${time.replaceAll(":", "")}_${filenamePart(nonce).slice(0, 8)}.pdf`;
  const context = report.documentContext ?? [
    ...report.summary
      .filter((v) => /Avtomobil|Nömrə|İşçi|Usta|Təchizatçı/.test(v.label))
      .map((v) => v.value),
    ...report.sections
      .flatMap((s) => s.fields ?? [])
      .filter((v) =>
        /Avtomobil|D.Q.N.|Dövlət.*nişanı|Bizim hesab|Kimdən|Kimə/.test(v.label),
      )
      .map((v) => v.value),
    report.filters || "",
  ];
  const title =
    report.title === "İşçilər üzrə ümumi hesabat"
      ? "İşçilər-Ümumi"
      : report.title === "Təchizatçılar üzrə ümumi hesabat"
        ? "Təchizatçılar-Ümumi"
        : report.title;
  const parts = ["PRIME", title, ...context].map(filenamePart).filter(Boolean);
  return (
    Array.from(new Set(parts))
      .join("_")
      .slice(0, 180 - suffix.length)
      .replace(/[-_]+$/, "") + suffix
  );
}

export function documentDisposition(report: PrimeReport) {
  const name = documentFilename(report);
  return `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
