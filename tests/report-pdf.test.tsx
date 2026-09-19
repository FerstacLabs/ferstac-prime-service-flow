// @vitest-environment node
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/report-pdf";
import type { PrimeReport } from "@/lib/reports/report-types";
import { handoverReport } from "@/lib/reports/handover";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cloneElement } from "react";

describe("report PDF rendering", () => {
  it("paginates long Unicode notes and renders a one-page handover", async () => {
    const long: PrimeReport = {
      scope: "work",
      title: "Ə ə Ğ ğ İ ı Ö ö Ş ş Ü ü Ç ç",
      generatedAt: "18.09.2026 23:00",
      summary: [],
      sections: [
        {
          title: "Uzun qeyd sınağı",
          table: {
            columns: [
              { key: "work", label: "İş", width: 50 },
              { key: "note", label: "Qeyd", width: 50 },
            ],
            rows: Array.from({ length: 60 }, (_, i) => ({
              id: String(i),
              cells: {
                work: `${i + 1}. Qapı, qanad, kapot və baqaj boşluqlarının sazlanması`,
                note: "Ətraflı yoxlama: mühərrik, şüşə, ön qanad, ölçü və işıqlandırma. "
                  .repeat(5)
                  .slice(0, 250),
              },
            })),
          },
        },
      ],
    };
    const buffer = await renderToBuffer(
        cloneElement(ReportDocument({ report: long }), {
          onRender: (data: {
            _INTERNAL__LAYOUT__DATA_: {
              children: {
                children: {
                  type: string;
                  box: unknown;
                  children?: { value?: string }[];
                  lines?: { string: string }[];
                }[];
              }[];
            };
          }) => {
            data._INTERNAL__LAYOUT__DATA_.children.forEach((page, index) => {
              const footer = page.children.find(
                (n) =>
                  n.type === "TEXT" &&
                  n.children?.some((c) => c.value?.startsWith("Səhifə")),
              );
              expect(footer?.lines?.map((l) => l.string).join("")).toBe(
                `Səhifə ${index + 1} / ${data._INTERNAL__LAYOUT__DATA_.children.length}`,
              );
            });
          },
        }),
      ),
      handover = await renderToBuffer(
        <ReportDocument report={handoverReport("99-AA-999")} />,
      );
    expect(
      buffer.toString("latin1").match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1);
    expect(handover.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(
      1,
    );
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "long-notes.pdf"),
        buffer,
      );
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "handover-test.pdf"),
        handover,
      );
    }
  }, 20000);
  it("renders Azerbaijani text with the bundled Noto Sans font", async () => {
    const report: PrimeReport = {
      scope: "workers",
      title: "İşçilər hesabatı",
      generatedAt: "07.09.2026 21:04",
      summary: [
        { label: "İşçi məhsuldarlığı", value: "Əli Əliyev" },
        { label: "Əmək dəyəri", value: "5 000,00 AZN" },
        { label: "Ödənilməyib", value: "Təchizatçı" },
        { label: "Büdcə", value: "1 500,00 AZN" },
      ],
      sections: [
        {
          title: "Görüləcək işlər",
          table: {
            columns: [
              { key: "work", label: "İş", width: 60 },
              { key: "status", label: "Status", width: 40 },
            ],
            rows: [
              {
                id: "row-1",
                cells: {
                  work: "Qapı, qanad, kapot və baqaj boşluqlarının sazlanması",
                  status: "Tamamlanıb",
                },
                details: [
                  {
                    label: "Qeyd",
                    value: "Kəmər və roliklərin dəyişdirilməsi",
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    const buffer = await renderToBuffer(<ReportDocument report={report} />);
    expect(buffer.byteLength).toBeGreaterThan(5000);
  });
});
