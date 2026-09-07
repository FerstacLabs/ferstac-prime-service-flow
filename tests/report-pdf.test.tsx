import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/report-pdf";
import type { PrimeReport } from "@/lib/reports/report-types";

describe("report PDF rendering", () => {
  it("renders Azerbaijani text with the bundled Noto Sans font", async () => {
    const report: PrimeReport = {
      scope: "workers",
      title: "İşçilər hesabatı",
      generatedAt: "07.09.2026 21:04",
      summary: [
        { label: "İşçi məhsuldarlığı", value: "Əli Əliyev" },
        { label: "Əmək dəyəri", value: "5 000,00 AZN" },
        { label: "Ödənilməyib", value: "Təchizatçı" },
        { label: "Büdcə", value: "1 500,00 AZN" }
      ],
      sections: [
        {
          title: "Görüləcək işlər",
          table: {
            columns: [
              { key: "work", label: "İş", width: 60 },
              { key: "status", label: "Status", width: 40 }
            ],
            rows: [
              {
                id: "row-1",
                cells: {
                  work: "Qapı, qanad, kapot və baqaj boşluqlarının sazlanması",
                  status: "Tamamlanıb"
                },
                details: [{ label: "Qeyd", value: "Kəmər və roliklərin dəyişdirilməsi" }]
              }
            ]
          }
        }
      ]
    };

    const buffer = await renderToBuffer(<ReportDocument report={report} />);
    expect(buffer.byteLength).toBeGreaterThan(5000);
  });
});
