/* eslint-disable jsx-a11y/alt-text -- React-PDF images are not DOM images. */
import path from "node:path";
import { reportBrand, numericReportColumn } from "@/lib/reports/brand";
import { readFileSync } from "node:fs";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import type {
  PrimeReport,
  ReportField,
  ReportSection,
  ReportTable,
} from "@/lib/reports/report-types";

const notoRegular = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NotoSans-Regular.ttf",
);
const notoBold = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NotoSans-Bold.ttf",
);

Font.register({
  family: "Noto Sans",
  fonts: [
    { src: notoRegular, fontWeight: 400 },
    { src: notoBold, fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingRight: 28,
    paddingBottom: 36,
    paddingLeft: 28,
    fontFamily: "Noto Sans",
    fontSize: 9,
    color: "#181818",
    backgroundColor: "#fff",
  },
  header: {
    borderBottom: "1.5px solid #1e1e1e",
    paddingBottom: 8,
    marginBottom: 8,
  },
  brand: {
    fontSize: 9,
    letterSpacing: 0.8,
    color: "#555",
    marginBottom: 3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 14,
    lineHeight: 1.3,
    marginBottom: 5,
    fontWeight: 700,
    color: "#111",
  },
  meta: { marginTop: 4, lineHeight: 1.35, color: "#666", fontSize: 8.5 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
    marginBottom: 8,
  },
  summaryBox: { width: "50%", paddingHorizontal: 3, marginBottom: 0 },
  summaryInner: {
    borderBottom: "0.5px solid #aaa",
    padding: 5,
    minHeight: 30,
    backgroundColor: "#fff",
  },
  label: { color: "#666", fontSize: 7.8, marginBottom: 2 },
  value: { fontSize: 10, fontWeight: 700, color: "#111" },
  section: { marginTop: 7 },
  sectionHead: {
    marginBottom: 4,
    borderBottom: "1px solid #d9d9d9",
    paddingBottom: 3,
  },
  heading: { fontSize: 12, fontWeight: 700, color: "#111" },
  fields: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  field: { width: "50%", paddingHorizontal: 0, marginBottom: 0 },
  fieldInner: {
    border: "0.5px solid #aaa",
    padding: 4,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
  },
  table: { width: "100%", border: "1px solid #d7d7d7", borderBottom: 0 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottom: "1px solid #cfcfcf",
  },
  row: {
    flexDirection: "row",
    borderBottom: "1px solid #e2e2e2",
    minHeight: 22,
  },
  cell: {
    padding: 4.5,
    borderRight: "1px solid #e4e4e4",
    fontSize: 8.2,
    lineHeight: 1.35,
  },
  th: { fontWeight: 700, color: "#222", fontSize: 8.4 },
  details: {
    borderBottom: "1px solid #e7e7e7",
    padding: 5,
    backgroundColor: "#fcfcfc",
  },
  detailText: { color: "#444", fontSize: 8, marginBottom: 2 },
  empty: { padding: 8, color: "#666", fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 16,
    height: 18,
    lineHeight: 1.2,
    left: 28,
    right: 28,
    color: "#666",
    fontSize: 7.5,
    borderTop: "1px solid #ddd",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function ReportDocument({ report }: { report: PrimeReport }) {
  if (report.scope === "handover")
    return (
      <Document title={report.title} author="PRIME Flow">
        <Page
          size="A4"
          style={{
            ...styles.page,
            fontSize: 8.8,
            lineHeight: 1.23,
            paddingTop: 18,
            paddingBottom: 20,
          }}
        >
          <Image
            src={readFileSync(
              path.join(process.cwd(), "public/brand/prime-logo.png"),
            )}
            style={{
              width: 115,
              height: 34,
              objectFit: "contain",
              alignSelf: "center",
              marginBottom: 5,
            }}
          />
          <Text style={{ textAlign: "center", fontSize: 8, fontWeight: 700 }}>
            {reportBrand.company}
          </Text>
          <Text style={{ textAlign: "center", fontSize: 7, marginBottom: 5 }}>
            {reportBrand.address}
          </Text>
          <Text
            style={{
              fontSize: 16,
              lineHeight: 1.3,
              marginBottom: 5,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {report.title}
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: 9,
              lineHeight: 1.3,
              marginBottom: 9,
            }}
          >
            {report.subtitle}
          </Text>
          <Text
            fixed
            style={{ position: "absolute", bottom: 7, right: 28, fontSize: 7 }}
            render={({ pageNumber, totalPages }) =>
              `Səhifə ${pageNumber} / ${totalPages}`
            }
          />
          {report.sections.map((section) => (
            <View
              key={section.title}
              style={{ border: "1px solid #222", padding: 9, marginBottom: 10 }}
              wrap={false}
            >
              {section.paragraphs?.map((p, i) => (
                <Text key={i} style={{ marginBottom: 3 }}>
                  {i === 0 ? `${section.title}  ${p}` : p}
                </Text>
              ))}
              {section.signatures?.map((label) => (
                <View
                  key={label}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    marginTop: 10,
                  }}
                >
                  <Text style={{ width: "43%", fontWeight: 700 }}>
                    {label}:
                  </Text>
                  <View style={{ width: "22%", marginRight: 15 }}>
                    <Text>____________________</Text>
                    <Text style={{ textAlign: "center", fontSize: 7 }}>
                      (imza)
                    </Text>
                  </View>
                  <View style={{ flexGrow: 1 }}>
                    <Text>_________________________</Text>
                    <Text style={{ textAlign: "center", fontSize: 7 }}>
                      (ad/soyad)
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </Page>
      </Document>
    );
  return (
    <Document title={report.title} author="PRIME Flow">
      <Page
        size="A4"
        orientation={report.orientation ?? "portrait"}
        style={[
          styles.page,
          ["quotation", "purchases", "finance"].includes(report.scope)
            ? { paddingTop: 22 }
            : {},
        ]}
        wrap
      >
        <ReportHeader report={report} />
        <SummaryGrid
          items={report.summary}
          band={["purchases", "finance"].includes(report.scope)}
        />
        {report.sections.map((section) => (
          <ReportSectionView
            key={section.title}
            section={section}
            landscape={report.orientation === "landscape"}
            compact={["quotation", "purchases", "finance"].includes(
              report.scope,
            )}
            denseLedger={report.scope === "finance"}
          />
        ))}
        <View style={styles.footer} fixed>
          <Text>{reportBrand.company}</Text>
        </View>
        <Text
          fixed
          style={{
            position: "absolute",
            bottom: 16,
            right: 28,
            height: 13,
            width: 110,
            fontSize: 7.5,
            textAlign: "right",
            color: "#666",
          }}
          render={({ pageNumber, totalPages }) =>
            `Səhifə ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

function ReportHeader({ report }: { report: PrimeReport }) {
  const compact = ["quotation", "purchases", "finance"].includes(report.scope);
  return (
    <View
      style={[
        styles.header,
        compact ? { paddingBottom: 5, marginBottom: 3 } : {},
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: compact ? 3 : 8,
        }}
      >
        <Image
          src={readFileSync(
            path.join(process.cwd(), "public/brand/prime-logo.png"),
          )}
          style={{
            width: compact ? 125 : 140,
            height: compact ? 34 : 42,
            objectFit: "contain",
            marginBottom: compact ? 0 : 6,
          }}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: 700 }}>
            {reportBrand.company}
          </Text>
          <Text style={{ fontSize: 8, marginTop: 3 }}>
            {reportBrand.address}
          </Text>
        </View>
      </View>
      <Text
        style={[styles.title, compact ? { fontSize: 12, marginBottom: 2 } : {}]}
      >
        {report.title}
      </Text>
      <Text style={[styles.meta, compact ? { marginTop: 2, fontSize: 8 } : {}]}>
        Yaradılma tarixi: {report.generatedAt} | Valyuta: AZN
      </Text>
      {report.filters ? (
        <Text style={styles.meta}>{report.filters}</Text>
      ) : null}
    </View>
  );
}

function SummaryGrid({
  items = [],
  stacked = false,
  compact = false,
  band = false,
}: {
  items?: Array<{ label: string; value: string }>;
  stacked?: boolean;
  compact?: boolean;
  band?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={[styles.summaryGrid, compact ? { marginBottom: 4 } : {}]}>
      {items.map((item) => (
        <View
          key={`${item.label}-${item.value}`}
          style={
            band
              ? { width: `${100 / items.length}%` }
              : stacked
                ? { width: "100%", paddingLeft: "35%" }
                : styles.summaryBox
          }
          wrap={false}
        >
          <View
            style={[
              styles.summaryInner,
              stacked
                ? {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    minHeight: compact ? 17 : 20,
                    paddingVertical: compact ? 2 : 3,
                  }
                : {},
            ]}
          >
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.value}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportSectionView({
  section,
  landscape,
  compact = false,
  denseLedger = false,
}: {
  section: ReportSection;
  landscape: boolean;
  compact?: boolean;
  denseLedger?: boolean;
}) {
  return (
    <View
      style={[styles.section, compact ? { marginTop: 5, flexShrink: 0 } : {}]}
      wrap={!section.keepTogether}
    >
      <View
        style={[
          styles.sectionHead,
          compact ? { marginBottom: 3, paddingBottom: 2 } : {},
        ]}
        wrap={false}
        minPresenceAhead={45}
      >
        <Text style={[styles.heading, compact ? { fontSize: 10 } : {}]}>
          {section.title}
        </Text>
      </View>
      <SummaryGrid
        items={section.summary}
        stacked={section.keepTogether}
        compact={compact}
      />
      {section.fields?.length ? (
        <FieldGrid fields={section.fields} compact={compact} />
      ) : null}
      {section.table ? (
        <ReportTableView
          table={section.table}
          landscape={landscape}
          compact={compact}
          denseLedger={denseLedger}
        />
      ) : null}
      {section.paragraphs?.length ? (
        <View style={{ fontSize: 8, lineHeight: 1.2, marginTop: 3 }}>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={{ marginBottom: 3 }}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.map((bullet) => (
            <View
              key={bullet}
              style={{ flexDirection: "row", marginBottom: 2 }}
              wrap={false}
            >
              <Text style={{ width: 9 }}>•</Text>
              <Text style={{ flex: 1 }}>{bullet}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {section.signatures ? (
        <View
          wrap={false}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginTop: compact ? 3 : 6,
          }}
        >
          {section.signatures.map((label) => (
            <View
              key={label}
              style={{
                width: label === "Tarix" ? "100%" : "50%",
                marginTop: compact ? 4 : 7,
              }}
            >
              <Text style={{ fontSize: 9 }}>
                {label}
                {label === "Tarix" ? ": ____________________" : ""}
              </Text>
              {label !== "Tarix" ? (
                <>
                  <Text style={{ marginTop: compact ? 3 : 5, fontSize: 8 }}>
                    Ad/Soyad: ____________________
                  </Text>
                  <Text style={{ marginTop: compact ? 3 : 5, fontSize: 8 }}>
                    İmza: ____________________
                  </Text>
                </>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FieldGrid({
  fields,
  compact = false,
}: {
  fields: ReportField[];
  compact?: boolean;
}) {
  return (
    <View style={styles.fields}>
      {fields.map((field) => (
        <View
          key={field.label}
          style={[styles.field, field.fullWidth ? { width: "100%" } : {}]}
          wrap={false}
        >
          <View
            style={[
              styles.fieldInner,
              compact ? { paddingVertical: 3, minHeight: 20 } : {},
            ]}
          >
            <Text style={[styles.label, { width: "37%", marginBottom: 0 }]}>
              {field.label}
            </Text>
            <Text style={[styles.value, { width: "63%", fontSize: 9 }]}>
              {field.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportTableView({
  table,
  landscape,
  compact = false,
  denseLedger = false,
}: {
  table: ReportTable;
  landscape: boolean;
  compact?: boolean;
  denseLedger?: boolean;
}) {
  if (!table.rows.length) {
    return (
      <View style={styles.table}>
        <Text style={styles.empty}>Məlumat yoxdur.</Text>
      </View>
    );
  }
  const chunks = tableChunks(table, landscape, denseLedger);
  return (
    <>
      {chunks.map((rows, index) => (
        <View
          key={index}
          wrap={false}
          style={[
            styles.table,
            compact ? { flexShrink: 0 } : {},
            index > 0 ? { marginTop: 8 } : {},
          ]}
        >
          <View style={styles.tableHeader} wrap={false}>
            {table.columns.map((column) => (
              <Text
                key={column.key}
                style={[
                  styles.cell,
                  styles.th,
                  compact ? { padding: 3, fontSize: 8, lineHeight: 1.2 } : {},
                  {
                    flexBasis: `${column.width ?? 10}%`,
                    flexGrow: column.width ?? 10,
                    flexShrink: 1,
                    textAlign:
                      column.align ??
                      (numericReportColumn(column.label) ? "right" : "left"),
                  },
                ]}
              >
                {column.label}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={row.id} wrap={false}>
              <View style={[styles.row, compact ? { minHeight: 19 } : {}]}>
                {table.columns.map((column) => (
                  <Text
                    key={column.key}
                    style={[
                      styles.cell,
                      compact
                        ? { padding: 3, fontSize: 9, lineHeight: 1.2 }
                        : {},
                      {
                        flexBasis: `${column.width ?? 10}%`,
                        flexGrow: column.width ?? 10,
                        flexShrink: 1,
                        textAlign:
                          column.align ??
                          (numericReportColumn(column.label)
                            ? "right"
                            : "left"),
                      },
                    ]}
                  >
                    {row.cells[column.key] || "-"}
                  </Text>
                ))}
              </View>
              {row.details?.length ? (
                <View style={styles.details}>
                  {row.details.map((detail) => (
                    <Text key={detail.label} style={styles.detailText}>
                      {detail.label}: {detail.value}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function tableChunks(
  table: ReportTable,
  landscape: boolean,
  denseLedger = false,
) {
  const chunks: ReportTable["rows"][] = [];
  const width = landscape ? 785 : 539;
  const maxHeight = denseLedger
    ? landscape
      ? 350
      : 550
    : landscape
      ? 320
      : 500;
  const totalWidth = table.columns.reduce(
    (sum, column) => sum + (column.width ?? 10),
    0,
  );
  let rows: ReportTable["rows"] = [],
    height = 35;
  // Conservative text budgets keep each repeated header with its rows, even with long notes.
  for (const row of table.rows) {
    const lineCount = Math.max(
      ...table.columns.map((column) => {
        const charsPerLine = Math.max(
          1,
          Math.floor(
            ((width * (column.width ?? 10)) / totalWidth - 9) /
              (denseLedger ? 4.2 : 5.7),
          ),
        );
        return (row.cells[column.key] || "-")
          .split("\n")
          .reduce(
            (sum, line) =>
              sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
            0,
          );
      }),
    );
    const detailHeight = (row.details ?? []).reduce(
      (sum, detail) =>
        sum +
        14 *
          Math.max(
            1,
            Math.ceil(
              (detail.label.length + detail.value.length + 2) / (width / 5.7),
            ),
          ),
      0,
    );
    const rowHeight =
      (denseLedger
        ? Math.max(19, lineCount * 9.6 + 6)
        : Math.max(24, lineCount * 12 + 10)) + detailHeight;
    if (rows.length && height + rowHeight > maxHeight) {
      chunks.push(rows);
      rows = [];
      height = 35;
    }
    rows.push(row);
    height += rowHeight;
  }
  if (rows.length) chunks.push(rows);
  return chunks;
}
