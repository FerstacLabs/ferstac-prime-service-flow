import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PrimeReport, ReportField, ReportSection, ReportTable } from "@/lib/reports/report-types";

const notoRegular = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");
const notoBold = path.join(process.cwd(), "public", "fonts", "NotoSans-Bold.ttf");

Font.register({
  family: "Noto Sans",
  fonts: [
    { src: notoRegular, fontWeight: 400 },
    { src: notoBold, fontWeight: 700 }
  ]
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
    lineHeight: 1.35,
    color: "#181818",
    backgroundColor: "#fff"
  },
  header: { borderBottom: "1.5px solid #1e1e1e", paddingBottom: 10, marginBottom: 12 },
  brand: { fontSize: 9, letterSpacing: 0.8, color: "#555", marginBottom: 3, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: 700, color: "#111" },
  meta: { marginTop: 4, color: "#666", fontSize: 8.5 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, marginBottom: 8 },
  summaryBox: { width: "25%", paddingHorizontal: 3, marginBottom: 6 },
  summaryInner: { border: "1px solid #d8d8d8", borderRadius: 4, padding: 7, minHeight: 36, backgroundColor: "#fbfbfb" },
  label: { color: "#666", fontSize: 7.8, marginBottom: 2 },
  value: { fontSize: 10, fontWeight: 700, color: "#111" },
  section: { marginTop: 14 },
  sectionHead: { marginBottom: 6, borderBottom: "1px solid #d9d9d9", paddingBottom: 3 },
  heading: { fontSize: 12, fontWeight: 700, color: "#111" },
  fields: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  field: { width: "33.333%", paddingHorizontal: 3, marginBottom: 6 },
  fieldInner: { border: "1px solid #e1e1e1", borderRadius: 4, padding: 6 },
  table: { width: "100%", border: "1px solid #d7d7d7", borderBottom: 0 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f0f1f3", borderBottom: "1px solid #cfcfcf" },
  row: { flexDirection: "row", borderBottom: "1px solid #e2e2e2", minHeight: 22 },
  cell: { padding: 4.5, borderRight: "1px solid #e4e4e4", fontSize: 8.2, lineHeight: 1.35 },
  th: { fontWeight: 700, color: "#222", fontSize: 8.4 },
  details: { borderBottom: "1px solid #e7e7e7", padding: 5, backgroundColor: "#fcfcfc" },
  detailText: { color: "#444", fontSize: 8, marginBottom: 2 },
  empty: { padding: 8, color: "#666", fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    color: "#666",
    fontSize: 7.5,
    borderTop: "1px solid #ddd",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between"
  }
});

export function ReportDocument({ report }: { report: PrimeReport }) {
  return (
    <Document title={report.title} author="PRIME Flow">
      <Page size="A4" orientation={report.orientation ?? "portrait"} style={styles.page} wrap>
        <ReportHeader report={report} />
        <SummaryGrid items={report.summary} />
        {report.sections.map((section) => <ReportSectionView key={section.title} section={section} />)}
        <View style={styles.footer} fixed>
          <Text>PRIME Tuning & Detailing | PRIME Flow</Text>
          <Text render={({ pageNumber, totalPages }) => `Səhifə ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function ReportHeader({ report }: { report: PrimeReport }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>PRIME Tuning & Detailing</Text>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.meta}>Yaradılma tarixi: {report.generatedAt} | Valyuta: AZN</Text>
    </View>
  );
}

function SummaryGrid({ items = [] }: { items?: Array<{ label: string; value: string }> }) {
  if (!items.length) return null;
  return (
    <View style={styles.summaryGrid}>
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.summaryBox} wrap={false}>
          <View style={styles.summaryInner}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.value}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportSectionView({ section }: { section: ReportSection }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead} wrap={false}>
        <Text style={styles.heading}>{section.title}</Text>
      </View>
      <SummaryGrid items={section.summary} />
      {section.fields?.length ? <FieldGrid fields={section.fields} /> : null}
      {section.table ? <ReportTableView table={section.table} /> : null}
    </View>
  );
}

function FieldGrid({ fields }: { fields: ReportField[] }) {
  return (
    <View style={styles.fields}>
      {fields.map((field) => (
        <View key={field.label} style={styles.field} wrap={false}>
          <View style={styles.fieldInner}>
            <Text style={styles.label}>{field.label}</Text>
            <Text style={styles.value}>{field.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportTableView({ table }: { table: ReportTable }) {
  if (!table.rows.length) {
    return <View style={styles.table}><Text style={styles.empty}>Məlumat yoxdur.</Text></View>;
  }
  const chunks = chunk(table.rows, 18);
  return (
    <>
      {chunks.map((rows, index) => (
        <View key={index} style={[styles.table, index > 0 ? { marginTop: 8 } : undefined]}>
          <View style={styles.tableHeader} wrap={false}>
            {table.columns.map((column) => (
              <Text key={column.key} style={[styles.cell, styles.th, { flexBasis: `${column.width ?? 10}%`, flexGrow: column.width ?? 10, flexShrink: 1 }]}>
                {column.label}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={row.id} wrap={false}>
              <View style={styles.row}>
                {table.columns.map((column) => (
                  <Text key={column.key} style={[styles.cell, { flexBasis: `${column.width ?? 10}%`, flexGrow: column.width ?? 10, flexShrink: 1 }]}>
                    {row.cells[column.key] || "-"}
                  </Text>
                ))}
              </View>
              {row.details?.length ? (
                <View style={styles.details}>
                  {row.details.map((detail) => (
                    <Text key={detail.label} style={styles.detailText}>{detail.label}: {detail.value}</Text>
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

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
